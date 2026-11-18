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
import { toPublicConfig, buildSessionConfig } from "@/lib/config/sessionConfig";
import { INTERRUPTED_AFTER_MS } from "@/lib/config/constants";
import { publicEnv, serverEnv } from "@/lib/config/env";
import { generatePlan, getPlanSummary } from "@/lib/ai/plan";
import { enrichProjects } from "@/lib/hiring/github";
import { voiceName } from "@/lib/ai/schemas";
import { body, fail, json, ok, route, type Params } from "@/lib/utils/http";
import { removePrefix } from "@/lib/supabase/storage";
import type { SessionPublic } from "@/types/interview";

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
  retention: z.literal(true),
  shareWithCompany: z.boolean().optional(),
  acceptedAt: z.iso.datetime(),
});
export const sessionCreateSchema = privateDraft.extend({
  company: z.string().trim().min(1).max(80),
  roleTitle: z.string().trim().min(1).max(80),
  roleFamily: z.enum(ROLE_FAMILIES),
  seniority: z.enum(SENIORITIES),
  jobDescription: z.string().max(6000).optional(),
  lengthMinutes: z.union([z.literal(10), z.literal(20)]),
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
    lengthMinutes,
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
      lengthMinutes,
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
  const input = await body(request, sessionCreateSchema);
  const database = await db();
  await getParsedCv(database, input.cvId, user.id);
  await enforcePracticeLimit(database, user.id);
  const config = buildSessionConfig("practice", input);
  const [inserted] = await database
    .insert(interviewSessions)
    .values({ ...input, config, userId: user.id, aiMode: publicEnv.aiMode })
    .returning({ id: interviewSessions.id });
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
      lengthMinutes: s.lengthMinutes,
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
    if (updates.calibration)
      updates.calibration.echoSafe = !updates.calibration.headphones;
    await database
      .update(interviewSessions)
      .set(updates)
      .where(and(whereId(session), eq(interviewSessions.status, "ready")));
  } else fail("CONFLICT", "This interview cannot be edited now.");
  return ok();
});
export const planSession = route(async (_request, context: Params<"id">) => {
  const { user, session, database } = await requireSessionAccess(
    (await context.params).id,
    owner,
  );
  if (session.status === "ready")
    return json({ planSummary: getPlanSummary(session) });
  if (!["draft", "planning"].includes(session.status))
    fail("CONFLICT", "This interview cannot be planned now.");
  if (!session.cvId && session.config.cvRequired)
    fail("CONFLICT", "Upload your CV first.");
  const parsed = session.cvId
    ? await getParsedCv(database, session.cvId, user.id)
    : null;
  await database.transaction(async (tx) => {
    await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .for("update");
    if (session.kind === "practice")
      await enforcePracticeLimit(tx, user.id, session.id);
    await tx
      .update(interviewSessions)
      .set({ status: "planning" })
      .where(
        and(whereId(session), eq(interviewSessions.status, session.status)),
      );
  });
  try {
    const github =
      session.config.useGithub &&
      session.aiMode !== "mock" &&
      parsed?.links.github.length
        ? await enrichProjects(parsed.links.github, serverEnv().GITHUB_TOKEN)
        : [];
    const plan = await generatePlan(
      session,
      parsed,
      (await getProfile(user.id))?.fullName ?? "",
      github,
    );
    const [saved] = await database
      .update(interviewSessions)
      .set({ plan, status: "ready" })
      .where(and(whereId(session), eq(interviewSessions.status, "planning")))
      .returning();
    return json({ planSummary: getPlanSummary(saved ?? { ...session, plan }) });
  } catch {
    await database
      .update(interviewSessions)
      .set({ status: "draft" })
      .where(and(whereId(session), eq(interviewSessions.status, "planning")));
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
    .set({ status: "discarded" })
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
