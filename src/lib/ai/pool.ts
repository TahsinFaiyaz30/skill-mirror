import { createHash } from "node:crypto";

export type ProviderName = "gemini" | "groq";

export type ProviderModel = { provider: ProviderName; model: string };

export type KeySlot = {
  index: number;
  key: string;
  id: string;
  masked: string;
  source: string;
};

type CooldownEntry = {
  provider: ProviderName;
  keyId: string;
  masked: string;
  model: string;
  until: number;
  reason: string;
  status?: number;
};

export type Candidate = {
  model: string;
  modelIndex: number;
  slot: KeySlot;
};

const cooldowns = new Map<string, CooldownEntry>();

export function parseKeyList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\r\n,;]+/)
    .map((item) => {
      const trimmed = item.trim();
      if (
        trimmed.length >= 2 &&
        ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
          (trimmed.startsWith("'") && trimmed.endsWith("'")))
      ) {
        return trimmed.slice(1, -1).trim();
      }
      return trimmed;
    })
    .filter(Boolean);
}

function maskKey(key: string): string {
  return key.length >= 6 ? "…" + key.slice(-4) : "****";
}

function keyId(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}

export function providerKeys(
  provider: ProviderName,
  env: NodeJS.ProcessEnv = process.env,
): KeySlot[] {
  const base = provider === "gemini" ? "GEMINI_API_KEY" : "GROQ_API_KEY";
  const plural = base + "S";
  const numberedPattern = new RegExp(`^${base}_(\\d+)$`);
  const numbered = Object.keys(env)
    .map((name) => {
      const match = numberedPattern.exec(name);
      return match ? { name, order: Number(match[1]) } : null;
    })
    .filter((entry): entry is { name: string; order: number } => entry !== null)
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.name);

  const sources = [base, plural, ...numbered];
  const seen = new Set<string>();
  const slots: KeySlot[] = [];

  for (const source of sources) {
    for (const key of parseKeyList(env[source])) {
      if (seen.has(key)) continue;
      seen.add(key);
      slots.push({
        index: slots.length + 1,
        key,
        id: keyId(key),
        masked: maskKey(key),
        source,
      });
    }
  }
  return slots;
}

export function modelChain(
  primary: string,
  configured: string | undefined,
  defaults: readonly string[],
): string[] {
  const extras = configured ? parseKeyList(configured) : [...defaults];
  return [...new Set([primary.trim(), ...extras].filter(Boolean))];
}

export function extractStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as {
    status?: unknown;
    statusCode?: unknown;
    cause?: unknown;
  };
  if (typeof record.status === "number") return record.status;
  if (typeof record.statusCode === "number") return record.statusCode;
  if (record.cause && record.cause !== error) {
    return extractStatus(record.cause);
  }
  return undefined;
}

export function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }
  return String(error ?? "");
}

function isInvalidKey(error: unknown): boolean {
  return /api_key_invalid|api[- ]key (?:is )?(?:not valid|invalid)|invalid api[- ]key/i.test(
    extractMessage(error),
  );
}

function rejectsModelOptions(error: unknown): boolean {
  return /model_(?:not_found|decommissioned|not_supported)|\bmodel\b.*(?:not supported|not available|does not support|not found|decommissioned)|thinking[_ ]level|reasoning[_ ]effort|response[_ ]format|json_validate_failed|failed to generate (?:valid )?json/i.test(
    extractMessage(error),
  );
}

function rejectsPayload(error: unknown): boolean {
  return /payload size|request (?:entity )?(?:is )?too large|exceeds the (?:maximum|limit)|request size/i.test(
    extractMessage(error),
  );
}

export function parseRetryAfterMs(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as { headers?: unknown; cause?: unknown };
  const headers = record.headers;
  let value: string | null | undefined;
  if (headers && typeof headers === "object") {
    const withGet = headers as { get?: (name: string) => string | null };
    if (typeof withGet.get === "function") {
      value = withGet.get("retry-after") ?? withGet.get("Retry-After");
    } else {
      const plain = headers as Record<string, unknown>;
      const raw = plain["retry-after"] ?? plain["Retry-After"];
      if (typeof raw === "string" || typeof raw === "number") {
        value = String(raw);
      }
    }
  }
  if (!value && record.cause && record.cause !== error) {
    return parseRetryAfterMs(record.cause);
  }
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const timestamp = Date.parse(value);
  if (Number.isFinite(timestamp)) {
    return Math.max(0, timestamp - Date.now());
  }
  return undefined;
}

export function isAbortOrTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "AbortError" ||
    error.name === "TimeoutError" ||
    /timeout/i.test(error.name) ||
    /aborted due to timeout/i.test(error.message)
  );
}

export function shouldFailoverStatus(
  status: number | undefined,
  keyCount: number,
): boolean {
  if (status === undefined) return false;
  if (status === 400) return false;
  if (status === 401 || status === 403) return keyCount > 1;
  return [404, 429, 500, 502, 503, 504].includes(status);
}

function classifyCooldown(
  error: unknown,
): { scope: "key" | "pair"; ms: number; reason: string } | null {
  const status = extractStatus(error);
  if (status === 401 || (status === 400 && isInvalidKey(error))) {
    return { scope: "key", ms: 30 * 60_000, reason: "auth_error" };
  }
  if (status === 403) {
    return { scope: "pair", ms: 60 * 60_000, reason: "model_access_denied" };
  }
  if (status === 429 && /limit:\s*0\b/i.test(extractMessage(error))) {
    return { scope: "pair", ms: 60 * 60_000, reason: "tier_limit_0" };
  }
  if (status === 429) {
    const retrySeconds = /please retry in (\d+(?:\.\d+)?)s\b/i.exec(
      extractMessage(error),
    )?.[1];
    const retryAfterMs =
      parseRetryAfterMs(error) ??
      (retrySeconds ? Number(retrySeconds) * 1000 : 60_000);
    return {
      scope: "pair",
      ms: Math.min(24 * 60 * 60_000, Math.max(1_000, retryAfterMs)),
      reason: "rate_limit",
    };
  }
  if (status === 404) {
    return { scope: "pair", ms: 60 * 60_000, reason: "model_unavailable" };
  }
  if (status !== undefined && [500, 502, 503, 504].includes(status)) {
    return { scope: "pair", ms: 45_000, reason: "upstream_unavailable" };
  }
  if (isAbortOrTimeoutError(error)) {
    return { scope: "pair", ms: 15_000, reason: "timeout" };
  }
  return null;
}

function keyScopeEntry(provider: ProviderName, keyIdValue: string) {
  return `${provider}:${keyIdValue}:*`;
}

function pairScopeEntry(
  provider: ProviderName,
  keyIdValue: string,
  model: string,
) {
  return `${provider}:${keyIdValue}:${model}`;
}

function pruneExpired(now = Date.now()) {
  for (const [k, entry] of cooldowns.entries()) {
    if (entry.until <= now) cooldowns.delete(k);
  }
}

export function isCooledDown(
  provider: ProviderName,
  slot: KeySlot,
  model: string,
  now = Date.now(),
): number | null {
  pruneExpired(now);
  const keyWide = cooldowns.get(keyScopeEntry(provider, slot.id));
  const pair = cooldowns.get(pairScopeEntry(provider, slot.id, model));
  if (!keyWide && !pair) return null;
  return Math.max(keyWide?.until ?? 0, pair?.until ?? 0);
}

export function isKeyDisabled(
  provider: ProviderName,
  slot: KeySlot,
  now = Date.now(),
): boolean {
  pruneExpired(now);
  return cooldowns.has(keyScopeEntry(provider, slot.id));
}

export function markCooldown(
  provider: ProviderName,
  slot: KeySlot,
  model: string,
  error: unknown,
  now = Date.now(),
) {
  const status = extractStatus(error);
  const info = classifyCooldown(error);
  if (!info) return;
  const scopeModel = info.scope === "key" ? "*" : model;
  const cacheKey =
    info.scope === "key"
      ? keyScopeEntry(provider, slot.id)
      : pairScopeEntry(provider, slot.id, model);
  cooldowns.set(cacheKey, {
    provider,
    keyId: slot.id,
    masked: slot.masked,
    model: scopeModel,
    until: now + info.ms,
    reason: info.reason,
    ...(status !== undefined && { status }),
  });
}

export function clearCooldown(
  provider: ProviderName,
  slot: KeySlot,
  model: string,
) {
  cooldowns.delete(pairScopeEntry(provider, slot.id, model));
  cooldowns.delete(keyScopeEntry(provider, slot.id));
}

export function resetProviderPool() {
  cooldowns.clear();
}

export function orderCandidates(
  provider: ProviderName,
  models: readonly string[],
  keys: readonly KeySlot[],
  now = Date.now(),
): Candidate[] {
  const ready: Candidate[] = [];
  const cooled: Array<Candidate & { cooldownUntil: number }> = [];

  for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
    const model = models[modelIndex];
    for (const slot of keys) {
      const candidate: Candidate = { model, modelIndex, slot };
      const until = isCooledDown(provider, slot, model, now);
      if (until === null) {
        ready.push(candidate);
      } else {
        cooled.push({ ...candidate, cooldownUntil: until });
      }
    }
  }

  cooled.sort(
    (a, b) =>
      a.cooldownUntil - b.cooldownUntil ||
      a.modelIndex - b.modelIndex ||
      a.slot.index - b.slot.index,
  );

  return [
    ...ready,
    ...cooled.map(({ model, modelIndex, slot }) => ({
      model,
      modelIndex,
      slot,
    })),
  ];
}

export async function tryProviderModels<T, Model extends ProviderModel>(
  models: readonly Model[],
  timeoutMs: number,
  request: (
    model: Model,
    slot: KeySlot,
    signal: AbortSignal,
    timeout: number,
  ) => Promise<T>,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  const keys = { gemini: providerKeys("gemini"), groq: providerKeys("groq") };
  const rejectedProviders = new Set<ProviderName>();
  const usableKeys = ({ provider, model }: ProviderModel) =>
    rejectedProviders.has(provider)
      ? []
      : keys[provider].filter((slot) => !isCooledDown(provider, slot, model));
  let lastError: unknown;

  for (const [index, candidate] of models.entries()) {
    const { provider, model } = candidate;
    const slots = usableKeys(candidate);
    const now = Date.now();
    if (now >= deadline) break;
    if (!slots.length) continue;

    // Leave time for a lower-ranked model when the preferred model is slow
    // on every key. Fast failures return their unused time to the pool.
    const hasFallback = models
      .slice(index + 1)
      .some((next) => usableKeys(next).length);
    const modelDeadline = hasFallback
      ? now + Math.ceil((deadline - now) * 0.6)
      : deadline;
    for (const [keyIndex, slot] of slots.entries()) {
      if (isCooledDown(provider, slot, model)) continue;
      const remaining = modelDeadline - Date.now();
      if (remaining <= 0) break;
      // With a fallback model, the first key gets the model's whole budget:
      // a timeout moves on to the next model, and fast failures (429, 5xx,
      // auth) return their unused time to the next key. The last model has
      // nothing to move on to, so its keys share the time and one hung key
      // cannot use all of it.
      const timeout = hasFallback
        ? remaining
        : Math.min(
            remaining,
            Math.max(1_500, Math.ceil(remaining / (slots.length - keyIndex))),
          );
      const signal = AbortSignal.timeout(timeout);
      const started = Date.now();
      try {
        const result = await request(candidate, slot, signal, timeout);
        signal.throwIfAborted();
        clearCooldown(provider, slot, model);
        console.info("SkillMirror AI candidate succeeded", {
          provider,
          model,
          keyIndex: slot.index,
          durationMs: Date.now() - started,
        });
        return result;
      } catch (error) {
        lastError = signal.aborted ? signal.reason : error;
        const status = extractStatus(lastError);
        const timedOut =
          status === undefined && isAbortOrTimeoutError(lastError);
        markCooldown(provider, slot, model, lastError);
        console.warn("SkillMirror AI candidate failed", {
          provider,
          model,
          keyIndex: slot.index,
          durationMs: Date.now() - started,
          status: status ?? (timedOut ? "timeout" : "error"),
        });
        // A slow model is slow on every key, so try the next model instead
        // of spending the remaining time on the same model.
        if (timedOut && hasFallback) break;
        // A generic invalid request would repeat unchanged on other keys,
        // but another model may accept it. Key and model-option errors can
        // differ by key, so those keep rotating. A request rejected for its
        // size would fail on every model, so stop re-uploading it.
        if (
          status === 400 &&
          !isInvalidKey(lastError) &&
          !rejectsModelOptions(lastError)
        ) {
          if (rejectsPayload(lastError)) rejectedProviders.add(provider);
          break;
        }
        if (status === 413) {
          rejectedProviders.add(provider);
          break;
        }
      }
    }
  }

  throw lastError ?? new Error("No AI model and key are currently available.");
}

export function getPoolSnapshot(
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
) {
  pruneExpired(now);
  const forProvider = (provider: ProviderName) => {
    const keys = providerKeys(provider, env).map(
      ({ index, id, masked, source }) => ({ index, id, masked, source }),
    );
    const activeCooldowns = [...cooldowns.values()]
      .filter((entry) => entry.provider === provider)
      .sort((a, b) => a.until - b.until)
      .map((entry) => ({
        keyId: entry.keyId,
        masked: entry.masked,
        model: entry.model,
        reason: entry.reason,
        ...(entry.status !== undefined && { status: entry.status }),
        remainingMs: Math.max(0, entry.until - now),
        expiresAt: new Date(entry.until).toISOString(),
      }));
    return {
      keyCount: keys.length,
      keys,
      cooldowns: activeCooldowns,
    };
  };

  return {
    gemini: forProvider("gemini"),
    groq: forProvider("groq"),
  };
}
