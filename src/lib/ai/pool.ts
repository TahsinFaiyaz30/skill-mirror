import { createHash } from "node:crypto";

export type ProviderName = "gemini" | "groq";

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
  status: number | undefined,
  message: string,
  retryAfterMs: number | undefined,
  timedOut: boolean,
): { scope: "key" | "pair"; ms: number; reason: string } | null {
  if (status === 401 || status === 403) {
    return { scope: "key", ms: 30 * 60_000, reason: "auth_error" };
  }
  if (status === 429 && /limit:\s*0\b/i.test(message)) {
    return { scope: "pair", ms: 60 * 60_000, reason: "tier_limit_0" };
  }
  if (status === 429) {
    return {
      scope: "pair",
      ms: Math.min(15 * 60_000, Math.max(5 * 60_000, retryAfterMs ?? 0)),
      reason: "rate_limit",
    };
  }
  if (status === 404) {
    return { scope: "pair", ms: 60 * 60_000, reason: "model_unavailable" };
  }
  if (
    status !== undefined &&
    [500, 502, 503, 504].includes(status)
  ) {
    return { scope: "pair", ms: 45_000, reason: "upstream_unavailable" };
  }
  if (timedOut) {
    return { scope: "pair", ms: 45_000, reason: "timeout" };
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
  const info = classifyCooldown(
    status,
    extractMessage(error),
    parseRetryAfterMs(error),
    isAbortOrTimeoutError(error),
  );
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
