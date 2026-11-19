export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import {
  flashModelChain,
  liveModelChain,
  ttsModelChain,
} from "@/lib/ai/gemini";
import {
  groqStrategistModelChain,
  groqWhisperModelChain,
} from "@/lib/ai/groq";
import { getPoolSnapshot, resetProviderPool } from "@/lib/ai/pool";
import { publicEnv, serverEnv } from "@/lib/config/env";
import { body, json, route } from "@/lib/utils/http";

function providerSnapshot() {
  const env = serverEnv();
  return {
    pool: getPoolSnapshot(),
    models: {
      flash: flashModelChain(),
      live: liveModelChain(),
      liveThinkingLevel: env.MODEL_LIVE_THINKING_LEVEL,
      transcribe: env.MODEL_TRANSCRIBE,
      transcribeLive: env.MODEL_TRANSCRIBE_LIVE,
      tts: ttsModelChain(),
      groqStrategist: groqStrategistModelChain(),
      groqWhisper: groqWhisperModelChain(),
    },
    quotas: {
      maxInterviewsPerDay: env.MAX_INTERVIEWS_PER_DAY,
      maxCompanyInterviewsPerDayPerOrg:
        env.MAX_COMPANY_INTERVIEWS_PER_DAY_PER_ORG,
      recordingRetentionDays: env.RECORDING_RETENTION_DAYS,
    },
    aiMode: publicEnv.aiMode,
    aiDataTier: publicEnv.aiDataTier,
  };
}

export const GET = route(async () => {
  await requireAdmin();
  return json(providerSnapshot());
});

export const POST = route(async (request) => {
  await requireAdmin();
  await body(request, z.object({ action: z.literal("reset_cooldowns") }));
  resetProviderPool();
  return json(providerSnapshot());
});
