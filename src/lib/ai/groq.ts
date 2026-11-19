import Groq, { toFile } from "groq-sdk";
import { z } from "zod";
import { serverEnv } from "@/lib/config/env";
import type { Prompt } from "./gemini";
import {
  clearCooldown,
  extractStatus,
  isAbortOrTimeoutError,
  isKeyDisabled,
  markCooldown,
  modelChain,
  orderCandidates,
  providerKeys,
  shouldFailoverStatus,
} from "./pool";

export const DEFAULT_GROQ_STRATEGIST_FALLBACKS = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-20b",
] as const;

export const DEFAULT_GROQ_WHISPER_FALLBACKS = [
  "whisper-large-v3-turbo",
  "whisper-large-v3",
] as const;

export function groqStrategistModelChain(
  primary = serverEnv().GROQ_STRATEGIST_MODEL,
  configured = serverEnv().GROQ_STRATEGIST_FALLBACKS,
): string[] {
  return modelChain(primary, configured, DEFAULT_GROQ_STRATEGIST_FALLBACKS);
}

export function groqWhisperModelChain(
  primary = serverEnv().GROQ_WHISPER_MODEL,
  configured = serverEnv().GROQ_WHISPER_FALLBACKS,
): string[] {
  return modelChain(primary, configured, DEFAULT_GROQ_WHISPER_FALLBACKS);
}

export function requireGroqKeys() {
  const keys = providerKeys("groq");
  if (keys.length === 0) {
    throw new Error("GROQ_API_KEY is not configured.");
  }
  return keys;
}

const groq = (apiKey?: string) =>
  new Groq({ apiKey: apiKey ?? requireGroqKeys()[0].key, maxRetries: 0 });

export async function groqJSON<T>(
  prompt: Prompt,
  schema: z.ZodType<T>,
  options: {
    timeout: number;
    temperature: number;
    maxTokens: number;
    validate?: (value: T) => void;
  },
) {
  const keys = requireGroqKeys();
  const environment = serverEnv();
  const models = groqStrategistModelChain(
    environment.GROQ_STRATEGIST_MODEL,
    environment.GROQ_STRATEGIST_FALLBACKS,
  );
  const candidates = orderCandidates("groq", models, keys);
  const deadline = Date.now() + options.timeout;

  for (let i = 0; i < candidates.length; i++) {
    const { model, slot } = candidates[i];
    if (
      isKeyDisabled("groq", slot) &&
      candidates.slice(i + 1).some((c) => !isKeyDisabled("groq", c.slot))
    ) {
      continue;
    }
    const nextCandidate = candidates[i + 1];
    const hasNext = Boolean(nextCandidate);
    const client = groq(slot.key);
    let retry = "";

    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("Groq timeout");
      const callTimeout = hasNext
        ? Math.min(remaining, Math.max(1_000, Math.floor(remaining * 0.65)))
        : remaining;
      let validationPhase = false;
      try {
        const completion = await client.chat.completions.create(
          {
            model,
            messages: [
              { role: "system", content: prompt.system },
              { role: "user", content: prompt.user + retry },
            ],
            temperature: options.temperature,
            max_completion_tokens: options.maxTokens,
            ...(model.includes("gpt-oss") && {
              reasoning_effort: "low" as const,
            }),
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "skill_mirror_result",
                strict: true,
                schema: z.toJSONSchema(schema, { target: "draft-7" }),
              },
            },
          },
          { timeout: callTimeout },
        );
        validationPhase = true;
        const result = schema.parse(
          JSON.parse(completion.choices[0]?.message.content ?? "null"),
        );
        options.validate?.(result);
        clearCooldown("groq", slot, model);
        return result;
      } catch (error) {
        const status = extractStatus(error);
        const timedOut = isAbortOrTimeoutError(error);
        if (status === 400) throw error;
        if ((status === 401 || status === 403) && keys.length === 1) {
          throw error;
        }
        if (
          shouldFailoverStatus(status, keys.length) ||
          (timedOut && hasNext && deadline - Date.now() > 500)
        ) {
          markCooldown("groq", slot, model, error);
          if (hasNext) {
            console.warn("SkillMirror Groq failover:", {
              provider: "groq",
              keyIndex: slot.index,
              from: model,
              to: nextCandidate.model,
              nextKeyIndex: nextCandidate.slot.index,
              status: status ?? "timeout",
            });
            break;
          }
          throw error;
        }
        if (timedOut) {
          markCooldown("groq", slot, model, error);
          throw error;
        }
        if (
          validationPhase ||
          error instanceof SyntaxError ||
          error instanceof z.ZodError
        ) {
          if (attempt > 0) throw error;
          retry =
            "\n\nThe previous output failed validation. Fill in every requested field with the correct type." +
            (error instanceof z.ZodError
              ? " Invalid fields: " +
                error.issues.map((issue) => issue.path.join(".")).join(", ")
              : "");
        } else if (attempt === 0) {
          retry = "";
        } else if (hasNext) {
          markCooldown("groq", slot, model, error);
          console.warn("SkillMirror Groq failover:", {
            provider: "groq",
            keyIndex: slot.index,
            from: model,
            to: nextCandidate.model,
            nextKeyIndex: nextCandidate.slot.index,
            status: status ?? "error",
          });
          break;
        } else {
          throw error;
        }
      }
    }
  }
  throw new Error("Groq unavailable");
}

export async function whisper(
  bytes: Uint8Array,
  name: string,
  prompt?: string,
  timestamps = false,
) {
  const keys = requireGroqKeys();
  const environment = serverEnv();
  const models = groqWhisperModelChain(
    environment.GROQ_WHISPER_MODEL,
    environment.GROQ_WHISPER_FALLBACKS,
  );
  const candidates = orderCandidates("groq", models, keys);
  const deadline = Date.now() + 25_000;

  for (let i = 0; i < candidates.length; i++) {
    const { model, slot } = candidates[i];
    if (
      isKeyDisabled("groq", slot) &&
      candidates.slice(i + 1).some((c) => !isKeyDisabled("groq", c.slot))
    ) {
      continue;
    }
    const nextCandidate = candidates[i + 1];
    const hasNext = Boolean(nextCandidate);
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Groq Whisper timeout");
    const callTimeout = hasNext
      ? Math.min(remaining, Math.max(2_000, Math.floor(remaining * 0.65)))
      : remaining;

    try {
      const file = await toFile(Buffer.from(bytes), name);
      const transcription = await groq(slot.key).audio.transcriptions.create(
        {
          file,
          model,
          language: "en",
          temperature: 0,
          prompt,
          response_format: timestamps ? "verbose_json" : "json",
          ...(timestamps && { timestamp_granularities: ["word", "segment"] }),
        },
        { timeout: callTimeout },
      );
      clearCooldown("groq", slot, model);
      return transcription;
    } catch (error) {
      const status = extractStatus(error);
      const timedOut = isAbortOrTimeoutError(error);
      if (status === 400) throw error;
      if ((status === 401 || status === 403) && keys.length === 1) throw error;
      if (
        shouldFailoverStatus(status, keys.length) ||
        (timedOut && hasNext && deadline - Date.now() > 1_000)
      ) {
        markCooldown("groq", slot, model, error);
        if (hasNext) {
          console.warn("SkillMirror Groq Whisper failover:", {
            provider: "groq",
            keyIndex: slot.index,
            from: model,
            to: nextCandidate.model,
            nextKeyIndex: nextCandidate.slot.index,
            status: status ?? "timeout",
          });
          continue;
        }
      }
      throw error;
    }
  }
  throw new Error("Groq Whisper unavailable");
}
