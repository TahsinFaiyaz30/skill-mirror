import Groq, { toFile } from "groq-sdk";
import { z } from "zod";
import { serverEnv } from "@/lib/config/env";
import type { Prompt } from "./gemini";

const groq = () => new Groq({ apiKey: serverEnv().GROQ_API_KEY, maxRetries: 0 });
export async function groqJSON<T>(prompt: Prompt, schema: z.ZodType<T>, options: { timeout: number; temperature: number; maxTokens: number; validate?: (value: T) => void }) {
  const client = groq();
  const deadline = Date.now() + options.timeout;
  let retry = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Groq timeout");
    try {
      const completion = await client.chat.completions.create({
        model: serverEnv().GROQ_STRATEGIST_MODEL,
        messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user + retry }],
        temperature: options.temperature, max_completion_tokens: options.maxTokens, reasoning_effort: "low",
        response_format: { type: "json_schema", json_schema: { name: "skill_mirror_result", strict: true, schema: z.toJSONSchema(schema, { target: "draft-7" }) } },
      }, { timeout: remaining });
      const result = schema.parse(JSON.parse(completion.choices[0]?.message.content ?? "null"));
      options.validate?.(result);
      return result;
    } catch (error) {
      if (!(error instanceof z.ZodError || error instanceof SyntaxError) && !options.validate || attempt) throw error;
      retry = "\n\nThe previous output failed validation. Fill in every requested field with the correct type."
        + (error instanceof z.ZodError ? " Invalid fields: " + error.issues.map((issue) => issue.path.join(".")).join(", ") : "");
    }
  }
  throw new Error("Groq unavailable");
}

export function whisper(bytes: Uint8Array, name: string, prompt?: string, timestamps = false) {
  return toFile(Buffer.from(bytes), name).then((file) => groq().audio.transcriptions.create({
    file, model: serverEnv().GROQ_WHISPER_MODEL, language: "en", temperature: 0, prompt,
    response_format: timestamps ? "verbose_json" : "json",
    ...(timestamps && { timestamp_granularities: ["word", "segment"] }),
  }));
}
