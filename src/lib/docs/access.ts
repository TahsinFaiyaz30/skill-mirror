import { z } from "zod";
import {
  DOCS_VISIBILITY_MODES,
  type DocsAccessDecision,
  type DocsAccessSettings,
} from "@/types/docs";

export const DEFAULT_SCHEDULE_START = "2026-06-10T00:00:00.000Z";
export const DEFAULT_SCHEDULE_END = "2026-06-14T23:59:59.000Z";

export function evaluateDocsAccess(
  settings: DocsAccessSettings,
  now: Date = new Date(),
): DocsAccessDecision {
  const nowMs = now.getTime();
  if (settings.visibilityMode === "off") {
    return {
      allowed: false,
      mode: "off",
      reason: "disabled",
      label: "Offline (403)",
      windowStart: null,
      windowEnd: null,
    };
  }
  if (settings.visibilityMode === "on") {
    return {
      allowed: true,
      mode: "on",
      reason: "always_on",
      label: "Public (ON)",
      windowStart: null,
      windowEnd: null,
    };
  }
  if (settings.visibilityMode === "duration") {
    const startMs = settings.durationStartedAt
      ? Date.parse(settings.durationStartedAt)
      : Number.NaN;
    const hours = settings.durationHours ?? 0;
    if (!Number.isFinite(startMs) || hours <= 0) {
      return {
        allowed: false,
        mode: "duration",
        reason: "duration_expired",
        label: "Duration not active",
        windowStart: null,
        windowEnd: null,
      };
    }
    const endMs = startMs + hours * 3_600_000;
    const active = nowMs >= startMs && nowMs <= endMs;
    return {
      allowed: active,
      mode: "duration",
      reason: active ? "within_duration" : "duration_expired",
      label: active ? `Live (${hours}h window)` : "Publish duration ended",
      windowStart: new Date(startMs).toISOString(),
      windowEnd: new Date(endMs).toISOString(),
    };
  }
  const startMs = Date.parse(settings.scheduleStart);
  const endMs = Date.parse(settings.scheduleEnd);
  const valid =
    Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs;
  const active = valid && nowMs >= startMs && nowMs <= endMs;
  return {
    allowed: active,
    mode: "scheduled",
    reason: active ? "within_schedule" : "outside_schedule",
    label: active ? "Live (Scheduled window)" : "Scheduled (Outside window)",
    windowStart: valid ? new Date(startMs).toISOString() : null,
    windowEnd: valid ? new Date(endMs).toISOString() : null,
  };
}

export const teamMemberSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(100),
  role: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(160),
  bio: z.string().trim().max(320).optional(),
  photoPath: z.string().max(260).nullable(),
  github: z.string().trim().max(200).optional(),
});

export const pitchItemSchema = z.object({
  key: z.string().min(1).max(48),
  title: z.string().trim().min(1).max(120),
  eyebrow: z.string().trim().min(1).max(60),
  summary: z.string().trim().min(1).max(280),
  body: z.string().trim().min(1).max(4000),
});

export const featureItemSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(400),
  status: z.enum(["live", "beta", "upcoming", "planned"]),
  liveMetricKey: z
    .enum([
      "sessions",
      "completedReports",
      "cvs",
      "openings",
      "certificates",
      "events",
      "organizations",
      "users",
    ])
    .optional(),
});

export const roadmapPhaseSchema = z.object({
  horizon: z.enum(["short", "mid", "long"]),
  label: z.string().trim().min(1).max(80),
  timeframe: z.string().trim().min(1).max(60),
  items: z.array(z.string().trim().min(1).max(240)).max(12),
});

export const changelogEntrySchema = z.object({
  version: z.string().trim().min(1).max(32),
  date: z.string().trim().min(1).max(32),
  title: z.string().trim().min(1).max(140),
  highlights: z.array(z.string().trim().min(1).max(280)).max(12),
});

export const docsSectionSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_-]+$/),
  code: z.string().trim().min(1).max(12),
  title: z.string().trim().min(1).max(120),
  category: z.enum(["pitch", "technical", "operations", "custom"]),
  enabled: z.boolean(),
  summary: z.string().trim().max(320),
  bodyMarkdown: z.string().max(16000),
  diagramSource: z.string().max(6000).optional(),
});

export const docsDocumentSchema = z.object({
  tagline: z.string().trim().min(1).max(160),
  heroSubtitle: z.string().trim().min(1).max(400),
  teamName: z.string().trim().min(1).max(100),
  teamMembers: z.array(teamMemberSchema).max(24),
  pitchItems: z.array(pitchItemSchema).max(20),
  features: z.array(featureItemSchema).max(40),
  roadmap: z.array(roadmapPhaseSchema).max(6),
  changelog: z.array(changelogEntrySchema).max(30),
  sections: z.array(docsSectionSchema).min(1).max(30),
});

export const docsSettingsPatchSchema = z
  .object({
    visibilityMode: z.enum(DOCS_VISIBILITY_MODES),
    scheduleStart: z.string().datetime(),
    scheduleEnd: z.string().datetime(),
    durationStartedAt: z.string().datetime().nullable().optional(),
    durationHours: z.number().int().min(1).max(8760).nullable().optional(),
  })
  .refine(
    (value) => Date.parse(value.scheduleEnd) >= Date.parse(value.scheduleStart),
    {
      message: "Schedule end must be after schedule start.",
      path: ["scheduleEnd"],
    },
  );
