import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { serverEnv } from "@/lib/config/env";
import {
  requestStructuredOutput,
  type StructuredRequest,
} from "./structured-output";
import { modelChain, providerKeys, tryProviderModels } from "./pool";

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
    if (key === "maxItems" && typeof child === "number" && child > 10) continue;
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
      .filter((part) => part.type === "text" && typeof part.text === "string")
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

type GeminiJSONOptions<T> = {
  inline?: Inline;
  thinking?: "low" | "medium" | "high";
  maxTokens?: number;
  timeout?: number;
  validate?: (value: T) => void;
};

export function geminiStructuredRequest<T>(
  prompt: Prompt,
  schema: z.ZodType<T>,
  options: GeminiJSONOptions<T>,
): StructuredRequest {
  const structure = geminiJsonSchema(schema);
  return async (model, apiKey, text, signal, timeout) => {
    const thinking =
      model.includes("flash-lite") && options.thinking === "high"
        ? "low"
        : options.thinking;
    const generationConfig = {
      ...(thinking !== undefined && { thinking_level: thinking }),
      ...(options.maxTokens !== undefined && {
        max_output_tokens: options.maxTokens,
      }),
    };
    const interaction = await gemini(apiKey).interactions.create(
      {
        stream: false,
        model,
        input: options.inline ? [{ type: "text", text }, options.inline] : text,
        system_instruction: prompt.system,
        store: false,
        ...(Object.keys(generationConfig).length > 0 && {
          generation_config: generationConfig,
        }),
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: structure,
        },
      },
      { timeout_ms: timeout, signal, retries: { strategy: "none" } },
    );
    if (interaction.status === "failed")
      throw new Error("Gemini interaction failed.");
    return extractInteractionText(interaction as InteractionLike);
  };
}

export async function geminiJSON<T>(
  prompt: Prompt,
  schema: z.ZodType<T>,
  options: GeminiJSONOptions<T> = {},
) {
  const request = geminiStructuredRequest(prompt, schema, options);
  const models = flashModelChain().map((model) => ({
    provider: "gemini" as const,
    model,
    request,
  }));
  const { value } = await requestStructuredOutput(models, prompt, schema, {
    timeout: options.timeout ?? 120_000,
    validate: options.validate,
  });
  return value;
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
  const models = ttsModelChain().map((model) => ({
    provider: "gemini" as const,
    model,
  }));
  return tryProviderModels(
    models,
    timeoutMs,
    async ({ model }, slot, signal, timeout) => {
      const response = await gemini(slot.key).interactions.create(
        buildTtsInteraction(text, voice, model),
        { timeout_ms: timeout, signal, retries: { strategy: "none" } },
      );
      const encoded = extractInteractionAudio(response as InteractionLike);
      const wav = Buffer.from(encoded, "base64");
      if (
        wav.length < 44 ||
        wav.toString("ascii", 0, 4) !== "RIFF" ||
        wav.toString("ascii", 8, 12) !== "WAVE"
      ) {
        throw new Error("Speech generation did not return WAV audio.");
      }
      return wav;
    },
  );
}

export async function transcribeGemini(
  bytes: Uint8Array,
  mimeType = "audio/wav",
  timeoutMs = 20_000,
): Promise<{ text: string }> {
  const environment = serverEnv();
  const models = [
    ...new Set([environment.MODEL_TRANSCRIBE, ...flashModelChain()]),
  ].map((model) => ({ provider: "gemini" as const, model }));
  return tryProviderModels(
    models,
    timeoutMs,
    async ({ model }, slot, signal, timeout) => {
      const response = await gemini(slot.key).interactions.create(
        {
          stream: false,
          model,
          input: [
            {
              type: "text",
              text: "Transcribe the spoken audio verbatim. Return only the spoken words with no extra commentary.",
            },
            attachment("audio", mimeType, bytes),
          ],
          store: false,
        },
        { timeout_ms: timeout, signal, retries: { strategy: "none" } },
      );
      if (response.status === "failed")
        throw new Error("Gemini transcription failed.");
      return {
        text: extractInteractionText(response as InteractionLike).trim(),
      };
    },
  );
}
