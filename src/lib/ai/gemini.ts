import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { serverEnv } from "@/lib/config/env";

function requireGeminiKey() {
  const apiKey = serverEnv().GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  return apiKey;
}

export const gemini = () => new GoogleGenAI({ apiKey: requireGeminiKey() });

export const geminiLiveAuth = () =>
  new GoogleGenAI({
    apiKey: requireGeminiKey(),
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

function httpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as { status?: unknown; statusCode?: unknown };
  if (typeof record.status === "number") return record.status;
  if (typeof record.statusCode === "number") return record.statusCode;
  return undefined;
}

function isAbortError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
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
  const client = gemini();
  const environment = serverEnv();
  const structure = geminiJsonSchema(schema);
  const deadline = Date.now() + (options.timeout ?? 120_000);
  let retry = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Gemini timeout");
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
      if (options.thinking !== undefined)
        generationConfig.thinking_level = options.thinking;
      if (options.maxTokens !== undefined)
        generationConfig.max_output_tokens = options.maxTokens;
      const params = {
        stream: false as const,
        model: environment.MODEL_FLASH,
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
        timeout_ms: remaining,
        signal: AbortSignal.timeout(remaining),
      });
      if (interaction.status === "failed")
        throw new Error("Gemini interaction failed.");
      const rawText = extractInteractionText(interaction as InteractionLike);
      if (!rawText) throw new Error("Gemini returned no JSON text.");
      validationPhase = true;
      const result = schema.parse(JSON.parse(rawText));
      options.validate?.(result);
      return result;
    } catch (error) {
      const status = httpStatus(error);
      if (
        attempt > 0 ||
        isAbortError(error) ||
        (status !== undefined && [400, 401, 403, 404].includes(status))
      ) {
        throw error;
      }
      if (
        validationPhase ||
        error instanceof SyntaxError ||
        error instanceof z.ZodError
      ) {
        retry =
          "\n\nThe previous output failed validation. Return the complete response using the required fields and limits." +
          (error instanceof z.ZodError
            ? " Invalid fields: " +
              error.issues.map((item) => item.path.join(".")).join(", ")
            : "");
      } else {
        retry = "";
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
  const response = await gemini().interactions.create(
    buildTtsInteraction(text, voice),
    {
      timeout_ms: timeoutMs,
      signal: AbortSignal.timeout(timeoutMs),
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
  return wav;
}
