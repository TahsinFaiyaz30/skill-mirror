import Groq, { toFile } from "groq-sdk";
import { z } from "zod";
import { serverEnv } from "@/lib/config/env";
import type { Prompt } from "./gemini";
import { modelChain, tryProviderModels } from "./pool";
import {
  requestStructuredOutput,
  type StructuredRequest,
} from "./structured-output";

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

const groq = (apiKey: string) => new Groq({ apiKey, maxRetries: 0 });

type GroqJSONOptions<T> = {
  timeout: number;
  temperature: number;
  maxTokens: number;
  strict?: boolean;
  validate?: (value: T) => void;
};

export function groqStructuredRequest<T>(
  prompt: Prompt,
  schema: z.ZodType<T>,
  options: Omit<GroqJSONOptions<T>, "timeout">,
): StructuredRequest {
  const structure = z.toJSONSchema(schema, { target: "draft-7" });
  return async (model, apiKey, text, signal, timeout) => {
    const completion = await groq(apiKey).chat.completions.create(
      {
        model,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: text },
        ],
        temperature: options.temperature,
        max_completion_tokens: options.maxTokens,
        ...(model.includes("gpt-oss") && { reasoning_effort: "low" }),
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "skill_mirror_result",
            strict: options.strict ?? true,
            schema: structure,
          },
        },
      },
      { timeout, signal },
    );
    return completion.choices[0]?.message.content ?? "";
  };
}

export async function groqJSON<T>(
  prompt: Prompt,
  schema: z.ZodType<T>,
  options: GroqJSONOptions<T>,
) {
  const request = groqStructuredRequest(prompt, schema, options);
  const models = groqStrategistModelChain().map((model) => ({
    provider: "groq" as const,
    model,
    request,
  }));
  const { value } = await requestStructuredOutput(
    models,
    prompt,
    schema,
    options,
  );
  return value;
}

export async function whisper(
  bytes: Uint8Array,
  name: string,
  prompt?: string,
  timestamps = false,
) {
  const file = await toFile(Buffer.from(bytes), name);
  const models = groqWhisperModelChain().map((model) => ({
    provider: "groq" as const,
    model,
  }));
  return tryProviderModels(models, 25_000, ({ model }, slot, signal, timeout) =>
    groq(slot.key).audio.transcriptions.create(
      {
        file,
        model,
        language: "en",
        temperature: 0,
        prompt,
        response_format: timestamps ? "verbose_json" : "json",
        ...(timestamps && { timestamp_granularities: ["word", "segment"] }),
      },
      { timeout, signal },
    ),
  );
}
