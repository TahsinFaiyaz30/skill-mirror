import { sql } from "drizzle-orm";
import {
  flashModelChain,
  liveModelChain,
  ttsModelChain,
} from "@/lib/ai/gemini";
import {
  groqStrategistModelChain,
  groqWhisperModelChain,
} from "@/lib/ai/groq";
import { getPoolSnapshot } from "@/lib/ai/pool";
import { publicEnv, serverEnv } from "@/lib/config/env";
import { db } from "@/lib/db";
import { events, interviewSessions } from "@/lib/db/schema";
import type { LiveDocsTelemetry } from "@/types/docs";
import { EXPOSED_API_ENDPOINTS } from "./api-catalog";

const CACHE_TTL_MS = 15_000;
let cachedTelemetry: { expiresAt: number; data: LiveDocsTelemetry } | null =
  null;

export function invalidateLiveDocsTelemetryCache() {
  cachedTelemetry = null;
}

type ScalarCountsRow = {
  users: number;
  practice_users: number;
  hiring_users: number;
  organizations: number;
  openings: number;
  active_openings: number;
  invitations: number;
  sessions: number;
  completed_sessions: number;
  practice_sessions: number;
  company_sessions: number;
  turns: number;
  reports: number;
  completed_reports: number;
  avg_score: number | null;
  cvs: number;
  parsed_cvs: number;
  certificates: number;
  events: number;
};

export async function getLiveDocsTelemetry(
  bypassCache = false,
): Promise<LiveDocsTelemetry> {
  const now = Date.now();
  if (!bypassCache && cachedTelemetry && cachedTelemetry.expiresAt > now) {
    return cachedTelemetry.data;
  }

  const database = await db();
  const env = serverEnv();

  // Keep concurrency low (3 sequential/pooled queries) so Supabase Supavisor
  // transaction pooler never queues or stalls on cold serverless starts.
  const scalarResult = await database.execute<ScalarCountsRow>(sql`
    SELECT
      (SELECT count(*)::int FROM public.profiles) AS users,
      (SELECT count(*)::int FROM public.profiles WHERE intent = 'practice') AS practice_users,
      (SELECT count(*)::int FROM public.profiles WHERE intent = 'hiring') AS hiring_users,
      (SELECT count(*)::int FROM public.organizations) AS organizations,
      (SELECT count(*)::int FROM public.openings) AS openings,
      (SELECT count(*)::int FROM public.openings WHERE status = 'active') AS active_openings,
      (SELECT count(*)::int FROM public.invitations) AS invitations,
      (SELECT count(*)::int FROM public.interview_sessions) AS sessions,
      (SELECT count(*)::int FROM public.interview_sessions WHERE status = 'completed') AS completed_sessions,
      (SELECT count(*)::int FROM public.interview_sessions WHERE kind = 'practice') AS practice_sessions,
      (SELECT count(*)::int FROM public.interview_sessions WHERE kind IN ('company', 'preview')) AS company_sessions,
      (SELECT count(*)::int FROM public.turns) AS turns,
      (SELECT count(*)::int FROM public.reports) AS reports,
      (SELECT count(*)::int FROM public.reports WHERE status = 'completed') AS completed_reports,
      (SELECT round(avg(overall_score))::int FROM public.reports WHERE status = 'completed' AND overall_score IS NOT NULL) AS avg_score,
      (SELECT count(*)::int FROM public.candidate_cvs) AS cvs,
      (SELECT count(*)::int FROM public.candidate_cvs WHERE parse_status = 'parsed') AS parsed_cvs,
      (SELECT count(*)::int FROM public.certificates WHERE revoked = false) AS certificates,
      (SELECT count(*)::int FROM public.events) AS events
  `);

  const scalarRows = Array.isArray(scalarResult)
    ? scalarResult
    : ((scalarResult as { rows?: ScalarCountsRow[] }).rows ?? []);
  const countsRow = scalarRows[0];

  const eventCats = await database
    .select({
      category: events.category,
      count: sql<number>`count(*)::int`,
    })
    .from(events)
    .groupBy(events.category);

  const dailyRows = await database
    .select({
      day: sql<string>`to_char(date_trunc('day', ${interviewSessions.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
      practice: sql<number>`count(*) filter (where ${interviewSessions.kind} = 'practice')::int`,
      company: sql<number>`count(*) filter (where ${interviewSessions.kind} in ('company', 'preview'))::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(interviewSessions)
    .where(sql`${interviewSessions.createdAt} >= now() - interval '14 days'`)
    .groupBy(
      sql`to_char(date_trunc('day', ${interviewSessions.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
    )
    .orderBy(
      sql`to_char(date_trunc('day', ${interviewSessions.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
    );

  const pool = getPoolSnapshot();

  const data: LiveDocsTelemetry = {
    syncedAt: new Date().toISOString(),
    environment: {
      appUrl: publicEnv.appUrl,
      aiMode: publicEnv.aiMode,
      dataTier: publicEnv.aiDataTier,
      retentionDays: env.RECORDING_RETENTION_DAYS,
      maxPracticePerDay: env.MAX_INTERVIEWS_PER_DAY,
      maxCompanyPerDayPerOrg: env.MAX_COMPANY_INTERVIEWS_PER_DAY_PER_ORG,
      githubEnrichmentEnabled: env.FEATURE_GITHUB,
      emailConfigured: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM),
    },
    counts: {
      users: Number(countsRow?.users ?? 0),
      practiceUsers: Number(countsRow?.practice_users ?? 0),
      hiringUsers: Number(countsRow?.hiring_users ?? 0),
      organizations: Number(countsRow?.organizations ?? 0),
      openings: Number(countsRow?.openings ?? 0),
      activeOpenings: Number(countsRow?.active_openings ?? 0),
      invitations: Number(countsRow?.invitations ?? 0),
      sessions: Number(countsRow?.sessions ?? 0),
      completedSessions: Number(countsRow?.completed_sessions ?? 0),
      practiceSessions: Number(countsRow?.practice_sessions ?? 0),
      companySessions: Number(countsRow?.company_sessions ?? 0),
      turns: Number(countsRow?.turns ?? 0),
      reports: Number(countsRow?.reports ?? 0),
      completedReports: Number(countsRow?.completed_reports ?? 0),
      averageScore:
        countsRow?.avg_score === null || countsRow?.avg_score === undefined
          ? null
          : Number(countsRow.avg_score),
      cvs: Number(countsRow?.cvs ?? 0),
      parsedCvs: Number(countsRow?.parsed_cvs ?? 0),
      certificates: Number(countsRow?.certificates ?? 0),
      events: Number(countsRow?.events ?? 0),
    },
    eventsByCategory: eventCats.map((row) => ({
      category: row.category,
      count: Number(row.count),
    })),
    sessionsByDay: dailyRows.map((row) => ({
      day: row.day,
      practice: Number(row.practice),
      company: Number(row.company),
      total: Number(row.total),
    })),
    providers: {
      geminiKeyCount: pool.gemini.keyCount,
      groqKeyCount: pool.groq.keyCount,
      activeCooldowns:
        pool.gemini.cooldowns.length + pool.groq.cooldowns.length,
      flashModels: flashModelChain(),
      liveModels: liveModelChain(),
      transcribeLiveModel: env.MODEL_TRANSCRIBE_LIVE,
      ttsModels: ttsModelChain(),
      groqStrategistModels: groqStrategistModelChain(),
      groqWhisperModels: groqWhisperModelChain(),
    },
    apiEndpointsCount: EXPOSED_API_ENDPOINTS.length,
  };

  cachedTelemetry = { expiresAt: now + CACHE_TTL_MS, data };
  return data;
}
