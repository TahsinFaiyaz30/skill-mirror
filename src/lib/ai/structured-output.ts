import { z } from "zod";
import type { Prompt } from "./gemini";
import { extractMessage, tryProviderModels, type ProviderModel } from "./pool";

export type StructuredRequest = (
  model: string,
  apiKey: string,
  userText: string,
  signal: AbortSignal,
  timeout: number,
) => Promise<string>;

export function requestStructuredOutput<T>(
  models: readonly (ProviderModel & { request: StructuredRequest })[],
  prompt: Prompt,
  schema: z.ZodType<T>,
  options: { timeout: number; validate?: (value: T) => void },
): Promise<{ value: T; source: ProviderModel }> {
  function parse(text: string) {
    const value = schema.parse(JSON.parse(text));
    options.validate?.(value);
    return value;
  }

  return tryProviderModels(
    models,
    options.timeout,
    async (candidate, slot, signal, timeout) => {
      const request = (text: string) =>
        candidate.request(candidate.model, slot.key, text, signal, timeout);
      const text = await request(prompt.user).catch((error: unknown) => {
        if (
          /json_validate_failed|failed to generate (?:valid )?json/i.test(
            extractMessage(error),
          )
        )
          return "";
        throw error;
      });
      const source = { provider: candidate.provider, model: candidate.model };
      try {
        return { value: parse(text), source };
      } catch (error) {
        signal.throwIfAborted();
        const fields =
          error instanceof z.ZodError
            ? " Invalid fields: " +
              error.issues.map(({ path }) => path.join(".")).join(", ")
            : "";
        const correction =
          "\n\nThe previous output failed validation. Return the complete response with the required fields and limits." +
          fields;
        return {
          value: parse(await request(prompt.user + correction)),
          source,
        };
      }
    },
  );
}
