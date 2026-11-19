import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { serverEnv } from "@/lib/config/env";
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

export function requireGeminiKeys() {
  const keys = providerKeys("gemini");
  if (keys.length === 0) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  return keys;
}

export const gemini = (apiKey?: string) =>
  new GoogleGenAI({
    apiKey: apiKey ?? requireGeminiKeys()[0].key,
    httpOptions: { apiVersion: "v1beta" },
  });

export const geminiLiveAuth = (apiKey?: string) =>
  new GoogleGenAI({
    apiKey: apiKey ?? requireGeminiKeys()[0].key,
    httpOptions: { apiVersion: "v1alpha" },
  });

export const INTERVIEWER_TTS_STYLE =
  "Speak as a calm, professional interviewer at a natural pace.";

type Inline = { type: "document" | "audio"; mime_type: string; data: string };
export const attachment = (
  type: Inline["type"],
  mime_type: string,
  bytes: Uint8Array,
): Inline => ({ type, mime_type, data: Buffer.from(bytes).toString("base64") });
export type Prompt = { system: string; user: string };

function sanitizeSchemaNode(value: unknown, isRoot = false): unknown {
  if (Array.isArray(value))
    return value.map((item) => sanitizeSchemaNode(item));
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (isRoot && key === "$schema") continue;
    if (key === "$schema" && typeof child === "string") continue;
    if (key === "maxItems" && typeof child === "number" && child > 10)
      continue;
    result[key] = sanitizeSchemaNode(child);
  }
  return result;
}

export function geminiJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, {
    target: "draft-7",
    unrepresentable: "any",
  });
  return sanitizeSchemaNode(raw, true) as Record<string, unknown>;
}

type InteractionLike = {
  output_text?: string;
  output_audio?: { data?: string };
  steps?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string; data?: string }>;
  }>;
};

function extractInteractionText(interaction: InteractionLike): string {
  if (interaction.output_text) return interaction.output_text;
  const steps = interaction.steps ?? [];
  const trailing: string[] = [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step?.type !== "model_output") {
      if (trailing.length > 0) break;
      continue;
    }
    const text = (step.content ?? [])
      .filter(
        (part) => part.type === "text" && typeof part.text === "string",
      )
      .map((part) => part.text as string)
      .join("");
    if (text) trailing.unshift(text);
  }
  return trailing.join("");
}

function extractInteractionAudio(interaction: InteractionLike): string {
  if (interaction.output_audio?.data) return interaction.output_audio.data;
  const steps = interaction.steps ?? [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step?.type !== "model_output") continue;
    const parts = step.content ?? [];
    for (let j = parts.length - 1; j >= 0; j--) {
      const part = parts[j];
      if (part?.type === "audio" && part.data) return part.data;
    }
  }
  return "";
}

export const DEFAULT_FLASH_FALLBACKS = [
  "gemini-4-hydrogen",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3-flash-preview",
  "gemini-3.5-flash-lite",
] as const;

export function flashModelChain(
  primary = serverEnv().MODEL_FLASH,
  configured = serverEnv().MODEL_FLASH_FALLBACKS,
): string[] {
  return modelChain(primary, configured, DEFAULT_FLASH_FALLBACKS);
}

export const DEFAULT_LIVE_FALLBACKS = [
  "gemini-3.8-live-extended-thinking",
  "gemini-3.8-live",
] as const;

export function liveModelChain(
  primary = serverEnv().MODEL_LIVE,
  configured = serverEnv().MODEL_LIVE_FALLBACKS,
): string[] {
  return modelChain(primary, configured, DEFAULT_LIVE_FALLBACKS);
}

export const DEFAULT_TTS_FALLBACKS = [
  "gemini-3.8-flash-tts",
  "gemini-3.8-flash-lite-tts",
] as const;

export function ttsModelChain(
  primary = serverEnv().MODEL_TTS,
  configured = serverEnv().MODEL_TTS_FALLBACKS,
): string[] {
  return modelChain(primary, configured, DEFAULT_TTS_FALLBACKS);
}

export async function geminiJSON<T>(
  prompt: Prompt,
  schema: z.ZodType<T>,
  options: {
    inline?: Inline;
    thinking?: "low" | "medium" | "high";
    maxTokens?: number;
    timeout?: number;
    validate?: (value: T) => void;
  } = {},
) {
  const keys = requireGeminiKeys();
  const environment = serverEnv();
  const structure = geminiJsonSchema(schema);
  const deadline = Date.now() + (options.timeout ?? 120_000);
  const models = flashModelChain(
    environment.MODEL_FLASH,
    environment.MODEL_FLASH_FALLBACKS,
  );
  const candidates = orderCandidates("gemini", models, keys);

  for (let i = 0; i < candidates.length; i++) {
    const { model, slot } = candidates[i];
    if (
      isKeyDisabled("gemini", slot) &&
      candidates.slice(i + 1).some((c) => !isKeyDisabled("gemini", c.slot))
    ) {
      continue;
    }
    const nextCandidate = candidates[i + 1];
    const hasNext = Boolean(nextCandidate);
    const client = gemini(slot.key);
    let retry = "";

    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("Gemini timeout");
      const modelTimeout = hasNext
        ? Math.min(remaining, Math.max(2_000, Math.floor(remaining * 0.65)))
        : remaining;
      const text = prompt.user + retry;
      const input = options.inline
        ? [{ type: "text" as const, text }, options.inline]
        : text;
      let validationPhase = false;
      try {
        const generationConfig: {
          thinking_level?: "low" | "medium" | "high";
          max_output_tokens?: number;
        } = {};
        if (options.thinking !== undefined) {
          generationConfig.thinking_level =
            model.includes("flash-lite") && options.thinking === "high"
              ? "low"
              : options.thinking;
        }
        if (options.maxTokens !== undefined)
          generationConfig.max_output_tokens = options.maxTokens;
        const params = {
          stream: false as const,
          model,
          input,
          system_instruction: prompt.system,
          store: false,
          ...(Object.keys(generationConfig).length > 0 && {
            generation_config: generationConfig,
          }),
          response_format: {
            type: "text" as const,
            mime_type: "application/json" as const,
            schema: structure,
          },
        };
        const interaction = await client.interactions.create(params, {
          timeout_ms: modelTimeout,
          signal: AbortSignal.timeout(modelTimeout),
          retries: { strategy: "none" as const },
        });
        if (interaction.status === "failed")
          throw new Error("Gemini interaction failed.");
        const rawText = extractInteractionText(interaction as InteractionLike);
        if (!rawText) throw new Error("Gemini returned no JSON text.");
        validationPhase = true;
        const result = schema.parse(JSON.parse(rawText));
        options.validate?.(result);
        clearCooldown("gemini", slot, model);
        return result;
      } catch (error) {
        const status = extractStatus(error);
        const timedOut = isAbortOrTimeoutError(error);
        if (status === 400) {
          throw error;
        }
        if ((status === 401 || status === 403) && keys.length === 1) {
          throw error;
        }
        if (
          shouldFailoverStatus(status, keys.length) ||
          (timedOut && hasNext && deadline - Date.now() > 1_000)
        ) {
          markCooldown("gemini", slot, model, error);
          if (hasNext) {
            console.warn("SkillMirror Gemini failover:", {
              provider: "gemini",
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
          markCooldown("gemini", slot, model, error);
          throw error;
        }
        if (
          validationPhase ||
          error instanceof SyntaxError ||
          error instanceof z.ZodError
        ) {
          if (attempt > 0) {
            throw error;
          }
          retry =
            "\n\nThe previous output failed validation. Return the complete response using the required fields and limits." +
            (error instanceof z.ZodError
              ? " Invalid fields: " +
                error.issues.map((item) => item.path.join(".")).join(", ")
              : "");
        } else if (attempt === 0) {
          retry = "";
        } else if (hasNext) {
          markCooldown("gemini", slot, model, error);
          console.warn("SkillMirror Gemini failover:", {
            provider: "gemini",
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
  throw new Error("Gemini unavailable");
}

export function buildTtsInteraction(
  text: string,
  voice: "Kore" | "Charon",
  model = serverEnv().MODEL_TTS,
) {
  return {
    stream: false as const,
    model,
    input: [
      {
        type: "user_input" as const,
        content: [
          {
            type: "text" as const,
            text,
            annotations: [
              {
                type: "speech_metadata" as const,
                style: INTERVIEWER_TTS_STYLE,
              },
            ],
          },
        ],
      },
    ],
    response_format: {
      type: "audio" as const,
      mime_type: "audio/wav" as const,
    },
    generation_config: { speech_config: [{ voice }] },
    store: false,
  };
}

export async function speakGemini(
  text: string,
  voice: "Kore" | "Charon",
  timeoutMs = 15_000,
) {
  const keys = requireGeminiKeys();
  const candidates = orderCandidates("gemini", ttsModelChain(), keys);
  const deadline = Date.now() + timeoutMs;

  for (let i = 0; i < candidates.length; i++) {
    const { model, slot } = candidates[i];
    if (
      isKeyDisabled("gemini", slot) &&
      candidates.slice(i + 1).some((c) => !isKeyDisabled("gemini", c.slot))
    ) {
      continue;
    }
    const nextCandidate = candidates[i + 1];
    const hasNext = Boolean(nextCandidate);
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Gemini TTS timeout");
    const callTimeout = hasNext
      ? Math.min(remaining, Math.max(2_000, Math.floor(remaining * 0.65)))
      : remaining;

    try {
      const response = await gemini(slot.key).interactions.create(
        buildTtsInteraction(text, voice, model),
        {
          timeout_ms: callTimeout,
          signal: AbortSignal.timeout(callTimeout),
          retries: { strategy: "none" as const },
        },
      );
      const encoded = extractInteractionAudio(response as InteractionLike);
      if (!encoded) throw new Error("Speech generation returned no audio.");
      const wav = Buffer.from(encoded, "base64");
      if (
        wav.length < 44 ||
        wav.toString("ascii", 0, 4) !== "RIFF" ||
        wav.toString("ascii", 8, 12) !== "WAVE"
      ) {
        throw new Error("Speech generation did not return WAV audio.");
      }
      clearCooldown("gemini", slot, model);
      return wav;
    } catch (error) {
      const status = extractStatus(error);
      const timedOut = isAbortOrTimeoutError(error);
      if (status === 400) throw error;
      if ((status === 401 || status === 403) && keys.length === 1) throw error;
      if (
        shouldFailoverStatus(status, keys.length) ||
        (timedOut && hasNext && deadline - Date.now() > 1_000)
      ) {
        markCooldown("gemini", slot, model, error);
        if (hasNext) {
          console.warn("SkillMirror Gemini TTS failover:", {
            provider: "gemini",
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
  throw new Error("Gemini TTS unavailable");
}

export async function transcribeGemini(
  bytes: Uint8Array,
  mimeType = "audio/wav",
  timeoutMs = 20_000,
): Promise<{ text: string }> {
  const keys = requireGeminiKeys();
  const environment = serverEnv();
  const models = [
    ...new Set([
      environment.MODEL_TRANSCRIBE,
      ...flashModelChain(
        environment.MODEL_FLASH,
        environment.MODEL_FLASH_FALLBACKS,
      ),
    ]),
  ];
  const candidates = orderCandidates("gemini", models, keys);
  const deadline = Date.now() + timeoutMs;

  for (let i = 0; i < candidates.length; i++) {
    const { model, slot } = candidates[i];
    if (
      isKeyDisabled("gemini", slot) &&
      candidates.slice(i + 1).some((c) => !isKeyDisabled("gemini", c.slot))
    ) {
      continue;
    }
    const nextCandidate = candidates[i + 1];
    const hasNext = Boolean(nextCandidate);
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Gemini transcription timeout");
    const callTimeout = hasNext
      ? Math.min(remaining, Math.max(2_000, Math.floor(remaining * 0.65)))
      : remaining;

    try {
      const response = await gemini(slot.key).interactions.create(
        {
          stream: false as const,
          model,
          input: [
            {
              type: "text" as const,
              text: "Transcribe the spoken audio verbatim. Return only the spoken words with no extra commentary.",
            },
            attachment("audio", mimeType, bytes),
          ],
          store: false,
        },
        {
          timeout_ms: callTimeout,
          signal: AbortSignal.timeout(callTimeout),
          retries: { strategy: "none" as const },
        },
      );
      if (response.status === "failed") {
        throw new Error("Gemini transcription failed.");
      }
      clearCooldown("gemini", slot, model);
      return {
        text: extractInteractionText(response as InteractionLike).trim(),
      };
    } catch (error) {
      const status = extractStatus(error);
      const timedOut = isAbortOrTimeoutError(error);
      if (status === 400) throw error;
      if ((status === 401 || status === 403) && keys.length === 1) throw error;
      if (
        shouldFailoverStatus(status, keys.length) ||
        (timedOut && hasNext && deadline - Date.now() > 1_000)
      ) {
        markCooldown("gemini", slot, model, error);
        if (hasNext) {
          console.warn("SkillMirror Gemini STT failover:", {
            provider: "gemini",
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
  throw new Error("Gemini transcription unavailable");
}
