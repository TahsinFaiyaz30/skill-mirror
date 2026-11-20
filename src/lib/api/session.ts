import { and, count, desc, eq, gt, ne } from "drizzle-orm";
import { z } from "zod";
import {
  getProfile,
  requireSessionAccess,
  requireUser,
} from "@/lib/auth/guards";
import {
  candidateCvs,
  interviewSessions,
  reports,
  profiles,
  type SessionRow,
} from "@/lib/db/schema";
import { db, type Database } from "@/lib/db";
import { ROLE_FAMILIES, SENIORITIES } from "@/lib/config/taxonomy";
import {
  toPublicConfig,
  buildSessionConfig,
  storedInterviewLength,
} from "@/lib/config/sessionConfig";
import {
  INTERRUPTED_AFTER_MS,
  QUICK_INTERVIEW_MINUTES,
} from "@/lib/config/constants";
import { publicEnv, serverEnv, unpaidAI } from "@/lib/config/env";
import {
  generatePlan,
  getPlanSummary,
  PLAN_PREPARATION_TIMEOUT_MS,
} from "@/lib/ai/plan";
import { enrichProjects } from "@/lib/hiring/github";
import { voiceName } from "@/lib/ai/schemas";
import { body, fail, json, ok, route, type Params } from "@/lib/utils/http";
import { removePrefix } from "@/lib/supabase/storage";
import type { SessionPublic } from "@/types/interview";
import { defaultCalibration } from "@/lib/vision/features";

export const owner = ["owner"] as const;
const privateDraft = z.object({ cvId: z.uuid() });
export const calibrationSchema = z.object({
  gaze: z.object({
    yaw0: z.number(),
    pitch0: z.number(),
    h0: z.number(),
    v0: z.number(),
  }),
  posture: z.object({
    neckRatio0: z.number(),
    shoulderWidth0: z.number().positive(),
    shoulderMidX0: z.number(),
    shoulderMidY0: z.number(),
  }),
  audio: z.object({ noiseFloorDb: z.number(), micPeakDb: z.number() }),
  headphones: z.boolean(),
  echoSafe: z.boolean(),
  device: z.object({
    userAgent: z.string().max(500),
    gpu: z.string().max(250),
    visionTier: z.enum(["full", "degraded", "severe"]),
  }),
});
export const consentSchema = z.object({
  recording: z.literal(true),
  coachingOnly: z.literal(true),
  freeTierData: z.literal(true),
  syntheticInputs: z.boolean().optional(),
  retention: z.literal(true),
  shareWithCompany: z.boolean().optional(),
  acceptedAt: z.iso.datetime(),
});
export const sessionCreateSchema = privateDraft.extend({
  judgeMode: z.boolean().optional(),
  company: z.string().trim().min(1).max(80),
  roleTitle: z.string().trim().min(1).max(80),
  roleFamily: z.enum(ROLE_FAMILIES),
  seniority: z.enum(SENIORITIES),
  jobDescription: z.string().max(6000).optional(),
  lengthMinutes: z.union([
    z.literal(2),
    z.literal(QUICK_INTERVIEW_MINUTES),
    z.literal(10),
    z.literal(20),
  ]),
  voiceName,
});
const whereId = (session: SessionRow) => eq(interviewSessions.id, session.id);
export async function getParsedCv(
  database: Pick<Database, "select">,
  cvId: string,
  userId: string,
) {
  const [cv] = await database
    .select()
    .from(candidateCvs)
    .where(
      and(
        eq(candidateCvs.id, cvId),
        eq(candidateCvs.userId, userId),
        eq(candidateCvs.parseStatus, "parsed"),
      ),
    );
  if (!cv?.parsed)
    fail("BAD_REQUEST", "Select a CV that has been read successfully.");
  return cv.parsed;
}
export function makeSessionPublic(s: SessionRow): SessionPublic {
  const {
    id,
    kind,
    status,
    company,
    roleTitle,
    seniority,
    voiceName,
    aiMode,
    cvId,
    calibration,
    durationMs,
    endReason,
  } = s;
  const planSummary = getPlanSummary(s);
  return {
    session: {
      id,
      kind,
      status,
      company,
      roleTitle,
      seniority,
      lengthMinutes: s.config.lengthMinutes,
      voiceName,
      aiMode,
      cvId,
      calibration,
      startedAt: s.startedAt?.toISOString() ?? null,
      endedAt: s.endedAt?.toISOString() ?? null,
      durationMs,
      endReason,
    },
    config: toPublicConfig(s.config, planSummary?.interviewerName),
    planSummary,
  };
}
export function interrupted(session: SessionRow, now = Date.now()) {
  return (
    session.status === "in_progress" &&
    now -
      (
        session.lastActiveAt ??
        session.startedAt ??
        session.createdAt
      ).getTime() >
      INTERRUPTED_AFTER_MS
  );
}
export async function enforcePracticeLimit(
  database: Pick<Database, "select">,
  userId: string,
  exclude?: string,
) {
  const [result] = await database
    .select({ n: count() })
    .from(interviewSessions)
    .where(
      and(
        eq(interviewSessions.userId, userId),
        eq(interviewSessions.kind, "practice"),
        ne(interviewSessions.status, "draft"),
        gt(interviewSessions.createdAt, new Date(Date.now() - 86_400_000)),
        exclude ? ne(interviewSessions.id, exclude) : undefined,
      ),
    );
  if (result.n >= serverEnv().MAX_INTERVIEWS_PER_DAY)
    fail("RATE_LIMITED", "Daily interview limit reached. Try again tomorrow.");
}
export const createSession = route(async (request) => {
  const user = await requireUser();
  const { cvId, judgeMode, ...input } = await body(
    request,
    sessionCreateSchema,
  );
  const database = await db();
  const lengthMinutes = judgeMode ? QUICK_INTERVIEW_MINUTES : input.lengthMinutes;
  const config = buildSessionConfig("practice", { ...input, lengthMinutes });
  if (judgeMode) config.judgeMode = true;
  const inserted = await database.transaction(async (tx) => {
    await getParsedCv(tx, cvId, user.id);
    await enforcePracticeLimit(tx, user.id);
    const [session] = await tx
      .insert(interviewSessions)
      .values({
        ...input,
        lengthMinutes: storedInterviewLength(lengthMinutes),
        cvId,
        config,
        userId: user.id,
        aiMode: publicEnv.aiMode,
      })
      .returning({ id: interviewSessions.id });
    return session;
  });
  return json({ sessionId: inserted.id }, 201);
});
export const listSessions = route(async () => {
  const user = await requireUser();
  const rows = await (
    await db()
  )
    .select({
      session: interviewSessions,
      overallScore: reports.overallScore,
      verdict: reports.verdict,
    })
    .from(interviewSessions)
    .leftJoin(reports, eq(reports.sessionId, interviewSessions.id))
    .where(
      and(
        eq(interviewSessions.userId, user.id),
        eq(interviewSessions.kind, "practice"),
      ),
    )
    .orderBy(desc(interviewSessions.createdAt));
  return json({
    items: rows.map(({ session: s, overallScore, verdict }) => ({
      sessionId: s.id,
      company: s.company,
      roleTitle: s.roleTitle,
      seniority: s.seniority,
      lengthMinutes: s.config.lengthMinutes,
      status: s.status,
      displayStatus: interrupted(s) ? "interrupted" : s.status,
      createdAt: s.createdAt,
      durationMs:
        s.durationMs ??
        (interrupted(s) && s.startedAt && s.lastActiveAt
          ? s.lastActiveAt.getTime() - s.startedAt.getTime()
          : null),
      overallScore,
      verdict,
    })),
  });
});
export const getSession = route(async (_request, context: Params<"id">) =>
  json(
    makeSessionPublic(
      (await requireSessionAccess((await context.params).id)).session,
    ),
  ),
);
export const patchSession = route(async (request, context: Params<"id">) => {
  const { user, session, database } = await requireSessionAccess(
    (await context.params).id,
    owner,
  );
  if (session.status === "draft") {
    const { cvId } = await body(request, privateDraft);
    await getParsedCv(database, cvId, user.id);
    await database
      .update(interviewSessions)
      .set({ cvId })
      .where(and(whereId(session), eq(interviewSessions.status, "draft")));
  } else if (session.status === "ready") {
    const updates = await body(
      request,
      z.object({
        calibration: calibrationSchema.optional(),
        consent: consentSchema.optional(),
      }),
    );
    if (!updates.calibration && !updates.consent)
      fail("BAD_REQUEST", "Provide calibration or consent.");
    if (
      updates.consent &&
      unpaidAI &&
      session.aiMode !== "mock" &&
      !updates.consent.syntheticInputs
    )
      fail(
        "BAD_REQUEST",
        "Confirm synthetic interview materials before starting this demo.",
      );
    if (updates.calibration) {
      updates.calibration.echoSafe = !updates.calibration.headphones;
      if (session.config.evaluation.nonverbalPolicy === "off") {
        updates.calibration.gaze = defaultCalibration.gaze;
        updates.calibration.posture = defaultCalibration.posture;
      }
    }
    await database
      .update(interviewSessions)
      .set(updates)
      .where(and(whereId(session), eq(interviewSessions.status, "ready")));
  } else fail("CONFLICT", "This interview cannot be edited now.");
  return ok();
});
const PLAN_LEASE_MS = PLAN_PREPARATION_TIMEOUT_MS + 10_000;

export const planSession = route(async (_request, context: Params<"id">) => {
  const deadline = Date.now() + PLAN_PREPARATION_TIMEOUT_MS;
  const { user, session, database } = await requireSessionAccess(
    (await context.params).id,
    owner,
  );
  if (session.status === "ready")
    return json({ planSummary: getPlanSummary(session) });

  const claim = await database.transaction(async (tx) => {
    // Serialize the daily quota check and lease acquisition for this user.
    await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .for("update");
    const [current] = await tx
      .select()
      .from(interviewSessions)
      .where(whereId(session))
      .for("update");

    if (!current) fail("NOT_FOUND", "Interview not found.");
    if (current.status === "ready")
      return { status: "ready", current } as const;
    if (!["draft", "planning"].includes(current.status))
      fail("CONFLICT", "This interview cannot be planned now.");

    // A reload can join the current request. An expired lease can be reclaimed.
    const now = Date.now();
    if (
      current.status === "planning" &&
      current.lastActiveAt &&
      now - current.lastActiveAt.getTime() < PLAN_LEASE_MS
    )
      return { status: "planning" } as const;
    if (!current.cvId && current.config.cvRequired)
      fail("CONFLICT", "Upload your CV first.");
    const parsed = current.cvId
      ? await getParsedCv(tx, current.cvId, user.id)
      : null;
    if (current.kind === "practice")
      await enforcePracticeLimit(tx, user.id, current.id);
    const lease = new Date();
    await tx
      .update(interviewSessions)
      .set({ status: "planning", lastActiveAt: lease })
      .where(whereId(current));
    return { status: "acquired", current, parsed, lease } as const;
  });

  if (claim.status === "ready")
    return json({ planSummary: getPlanSummary(claim.current) });
  if (claim.status === "planning") return json({ planSummary: null }, 202);

  const { current, parsed, lease } = claim;
  const ownsLease = and(
    whereId(current),
    eq(interviewSessions.status, "planning"),
    eq(interviewSessions.lastActiveAt, lease),
  );
  try {
    const github =
      current.config.useGithub &&
      current.aiMode !== "mock" &&
      parsed?.links.github.length
        ? await enrichProjects(parsed.links.github, serverEnv().GITHUB_TOKEN)
        : [];
    const plan = await generatePlan(
      current,
      parsed,
      (await getProfile(user.id))?.fullName ?? "",
      github,
      deadline,
    );
    const [saved] = await database
      .update(interviewSessions)
      .set({ plan, status: "ready", lastActiveAt: null })
      .where(ownsLease)
      .returning();
    if (saved) return json({ planSummary: getPlanSummary(saved) });
    return json({ planSummary: null }, 202);
  } catch (error) {
    console.error("SkillMirror planSession failed", {
      type: error instanceof Error ? error.name : typeof error,
    });
    await database
      .update(interviewSessions)
      .set({ status: "draft", lastActiveAt: null })
      .where(ownsLease);
    fail(
      "AI_UNAVAILABLE",
      "We couldn't prepare your interview. Please try again.",
    );
  }
});
export const discardSession = route(async (_request, context: Params<"id">) => {
  const { session, database } = await requireSessionAccess(
    (await context.params).id,
    owner,
  );
  if (session.kind === "company")
    fail("FORBIDDEN", "Company interviews cannot be discarded.");
  if (!["draft", "ready"].includes(session.status) && !interrupted(session))
    fail("CONFLICT", "This interview cannot be discarded now.");
  await database
    .update(interviewSessions)
    .set({
      status: "discarded",
      endedAt: session.endedAt ?? session.lastActiveAt ?? new Date(),
    })
    .where(and(whereId(session), eq(interviewSessions.status, session.status)));
  return ok();
});
export const deleteSession = route(async (_request, context: Params<"id">) => {
  const { session, database } = await requireSessionAccess(
    (await context.params).id,
    owner,
  );
  if (session.kind === "company")
    fail("FORBIDDEN", "Company interviews cannot be deleted here.");
  const prefix = session.userId + "/" + session.id;
  await Promise.all([
    removePrefix("recordings", prefix),
    removePrefix("artifacts", prefix),
  ]);
  await database.delete(interviewSessions).where(whereId(session));
  return ok();
});
