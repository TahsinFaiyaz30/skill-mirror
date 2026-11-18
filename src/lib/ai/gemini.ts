import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { serverEnv } from "@/lib/config/env";

export const gemini = () => new GoogleGenAI({ apiKey: serverEnv().GEMINI_API_KEY, httpOptions: { apiVersion: "v1alpha" } });
type Inline = { type: "document" | "audio"; mime_type: string; data: string };
export const attachment = (type: Inline["type"], mime_type: string, bytes: Uint8Array): Inline =>
  ({ type, mime_type, data: Buffer.from(bytes).toString("base64") });
export type Prompt = { system: string; user: string };
export async function geminiJSON<T>(prompt: Prompt, schema: z.ZodType<T>, options: {
  inline?: Inline; temperature: number; thinking?: "low" | "medium" | "high"; maxTokens?: number; timeout?: number; validate?: (value: T) => void;
}) {
  const client = gemini();
  const environment = serverEnv();
  const structure = z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any" });
  const deadline = Date.now() + (options.timeout ?? 120_000);
  let retry = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Gemini timeout");
    const text = prompt.user + retry;
    const input = options.inline ? [{ type: "text" as const, text }, options.inline] : text;
    try {
      const params = {
        stream: false as const, model: environment.MODEL_FLASH, input, system_instruction: prompt.system, store: false,
        generation_config: { temperature: options.temperature, thinking_level: options.thinking, max_output_tokens: options.maxTokens },
        response_format: { type: "text" as const, mime_type: "application/json" as const, schema: structure },
      };
      const interaction = await client.interactions.create(params, { signal: AbortSignal.timeout(remaining) });
      const result = schema.parse(JSON.parse(interaction.output_text ?? "null"));
      options.validate?.(result);
      return result;
    } catch (error) {
      if (attempt) throw error;
      retry = "\n\nThe previous output failed validation. Return the complete response using the required fields and limits."
        + (error instanceof z.ZodError ? " Invalid fields: " + error.issues.map((item) => item.path.join(".")).join(", ") : "");
    }
  }
  throw new Error("Gemini unavailable");
}
export async function speakGemini(text: string, voice: "Kore" | "Charon") {
  const response = await gemini().interactions.create({
    model: serverEnv().MODEL_TTS,
    input: "Speak as a calm, professional interviewer at a natural pace.\n" + text,
    response_format: { type: "audio" }, generation_config: { speech_config: [{ voice }] }, store: false,
  });
  if (!response.output_audio?.data) throw new Error("Speech generation returned no audio.");
  return Buffer.from(response.output_audio.data, "base64");
}
