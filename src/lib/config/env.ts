import { z } from "zod";

const optional = z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional());
const optionalURL = z.preprocess((value) => value === "" ? undefined : value, z.url().optional());
const positive = (value: number) => z.preprocess((input) => input === "" ? undefined : input, z.coerce.number().int().positive().default(value));
export const aiModes = z.enum(["live", "pipeline", "mock"]);
export const publicEnv = z.object({
  appUrl: z.url().default("http://localhost:3000"), aiMode: aiModes.default("live"), supabaseUrl: optionalURL, supabaseAnonKey: optional,
}).parse({
  appUrl: process.env.NEXT_PUBLIC_APP_URL || undefined, aiMode: process.env.NEXT_PUBLIC_AI_MODE || undefined,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});
export const localMock = publicEnv.aiMode === "mock" && !publicEnv.supabaseUrl && !publicEnv.supabaseAnonKey
  && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(publicEnv.appUrl).hostname);
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: optional, DATABASE_URL: optional, GEMINI_API_KEY: optional, GROQ_API_KEY: optional,
  MODEL_LIVE: z.string().default("gemini-3.8-live"), MODEL_FLASH: z.string().default("gemini-3.8-flash"),
  MODEL_TTS: z.string().default("gemini-3.8-flash-lite-tts"),
  GROQ_STRATEGIST_MODEL: z.string().default("openai/gpt-oss-120b"),
  GROQ_WHISPER_MODEL: z.string().default("whisper-large-v3-turbo"),
  CERT_SIGNING_SECRET: optional, CRON_SECRET: optional,
  MAX_INTERVIEWS_PER_DAY: positive(3), MAX_COMPANY_INTERVIEWS_PER_DAY_PER_ORG: positive(20),
  RECORDING_RETENTION_DAYS: positive(30), RESEND_API_KEY: optional, EMAIL_FROM: optional,
  FEATURE_GITHUB: z.enum(["true", "false"]).default("false").transform((value) => value === "true"), GITHUB_TOKEN: optional,
});
export function serverEnv() {
  if (typeof window !== "undefined") throw new Error("Server configuration is only available on the server.");
  return serverSchema.parse(process.env);
}
