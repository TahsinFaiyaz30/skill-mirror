import { z } from "zod";

const blankAsUndefined = (value: unknown) => (value === "" ? undefined : value);
const optional = z.preprocess(blankAsUndefined, z.string().min(1).optional());
const optionalURL = z.preprocess(blankAsUndefined, z.url().optional());
const defaultString = (value: string) =>
  z.preprocess(blankAsUndefined, z.string().default(value));
const positive = (value: number) =>
  z.preprocess(
    blankAsUndefined,
    z.coerce.number().int().positive().default(value),
  );
export const aiModes = z.enum(["live", "pipeline", "mock"]);
export const publicEnv = z
  .object({
    appUrl: z.url().default("http://localhost:3000"),
    aiMode: aiModes.default("live"),
    aiDataTier: z.enum(["unpaid", "paid"]).default("unpaid"),
    supabaseUrl: optionalURL,
    supabaseAnonKey: optional,
  })
  .parse({
    appUrl: process.env.NEXT_PUBLIC_APP_URL || undefined,
    aiMode: process.env.NEXT_PUBLIC_AI_MODE || undefined,
    aiDataTier: process.env.NEXT_PUBLIC_AI_DATA_TIER || undefined,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
export const unpaidAI =
  publicEnv.aiMode !== "mock" && publicEnv.aiDataTier === "unpaid";
export const localMock =
  publicEnv.aiMode === "mock" &&
  !publicEnv.supabaseUrl &&
  !publicEnv.supabaseAnonKey &&
  ["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(publicEnv.appUrl).hostname,
  );
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: optional,
  DATABASE_URL: optional,
  GEMINI_API_KEY: optional,
  GEMINI_API_KEYS: optional,
  GROQ_API_KEY: optional,
  GROQ_API_KEYS: optional,
  MODEL_LIVE: defaultString("gemini-3.8-live"),
  MODEL_LIVE_FALLBACKS: optional,
  MODEL_LIVE_THINKING_LEVEL: z.preprocess(
    blankAsUndefined,
    z.enum(["low", "medium", "high"]).default("low"),
  ),
  MODEL_FLASH: defaultString("gemini-3.8-flash"),
  MODEL_FLASH_FALLBACKS: optional,
  MODEL_TRANSCRIBE: defaultString("gemini-3.5-transcribe"),
  MODEL_TRANSCRIBE_LIVE: defaultString("gemini-3.5-transcribe-live"),
  MODEL_TTS: defaultString("gemini-3.8-flash-lite-tts"),
  MODEL_TTS_FALLBACKS: optional,
  GROQ_STRATEGIST_MODEL: defaultString("openai/gpt-oss-120b"),
  GROQ_STRATEGIST_FALLBACKS: optional,
  GROQ_WHISPER_MODEL: defaultString("whisper-large-v3-turbo"),
  GROQ_WHISPER_FALLBACKS: optional,
  ADMIN_EMAILS: optional,
  CERT_SIGNING_SECRET: optional,
  CRON_SECRET: optional,
  MAX_INTERVIEWS_PER_DAY: positive(50),
  MAX_COMPANY_INTERVIEWS_PER_DAY_PER_ORG: positive(200),
  RECORDING_RETENTION_DAYS: positive(30),
  GMAIL_USER: optional,
  GMAIL_APP_PASSWORD: optional,
  FEATURE_GITHUB: z.preprocess(
    blankAsUndefined,
    z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  ),
  GITHUB_TOKEN: optional,
});
export function serverEnv() {
  if (typeof window !== "undefined")
    throw new Error("Server configuration is only available on the server.");
  return serverSchema.parse(process.env);
}
