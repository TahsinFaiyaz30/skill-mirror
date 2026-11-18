import { and, eq, sql } from "drizzle-orm";
import {
  ActivityHandling,
  Behavior,
  EndSensitivity,
  MediaResolution,
  Modality,
  StartSensitivity,
  Type,
  type LiveConnectConfig,
} from "@google/genai";
import { z } from "zod";
import { getProfile, requireSessionAccess } from "@/lib/auth/guards";
import {
  candidateCvs,
  interviewSessions,
  invitations,
  openings,
  transcriptSegments,
  turns,
  type SessionRow,
} from "@/lib/db/schema";
import { gemini } from "@/lib/ai/gemini";
import { evaluateAnswer, interruptChallenge } from "@/lib/ai/evaluate";
import { p5 } from "@/lib/ai/prompts/p5_live";
import {
  LIVE_NEW_SESSION_MS,
  LIVE_TOKEN_TTL_MS,
  LIVE_VAD_PREFIX_MS,
  LIVE_VAD_SILENCE_MS,
} from "@/lib/config/constants";
import { serverEnv } from "@/lib/config/env";
import {
  ANSWER_STATUSES,
  STRATEGIST_EVENTS,
  type StrategistInput,
} from "@/types/interview";
import {
  startInterview,
  transition,
  shouldScore,
} from "@/lib/strategist/engine";
import type { Item, InterviewContext } from "@/lib/strategist/state";
import { owner } from "./session";
import { body, fail, json, route, type Params } from "@/lib/utils/http";

export const ms = z
  .number()
  .int()
  .min(0)
  .max(24 * 60 * 60 * 1000);
const nullableNumber = z.number().nullable();
const vision = z.object({
  faceVisiblePct: nullableNumber,
  eyeContactPct: nullableNumber,
  gazeAversionCount: z.number(),
  blinkPerMin: nullableNumber,
  smileMean: nullableNumber,
  browTensionMean: nullableNumber,
  lipPressMean: nullableNumber,
  expressiveness: nullableNumber,
  postureOkPct: nullableNumber,
  swayPct: nullableNumber,
  armsCrossedPct: nullableNumber,
  gesturePct: nullableNumber,
  fidgetPct: nullableNumber,
  selfTouchCount: z.number(),
  multiFacePct: nullableNumber,
});
const voice = z.object({
  answerMs: ms,
  speechMs: ms,
  responseLatencyMs: nullableNumber,
  longPauseCount: z.number(),
  rmsMedianDb: nullableNumber,
  pitchMedianSt: nullableNumber,
  pitchRangeSt: nullableNumber,
  liveWordCount: z.number(),
  liveWpm: nullableNumber,
});
const strategistInput = z.object({
  event: z.enum(STRATEGIST_EVENTS),
  directiveSeq: z.number().int().nonnegative(),
  turnIdx: z.number().int().nonnegative(),
  answerStatus: z.enum(ANSWER_STATUSES),
  transcript: z.string().max(12000),
  timings: z.object({
    askStartMs: ms,
    askEndMs: ms,
    answerStartMs: ms.nullable(),
    answerEndMs: ms,
  }),
  metrics: z
    .object({ vision: vision.nullable(), voice: voice.nullable() })
    .nullable(),
  elapsedMs: ms,
});
function itemRow(
  sessionId: string,
  item: Item,
  directive: { turnIdx: number; sayText: string },
) {
  return {
    sessionId,
    idx: directive.turnIdx,
    phase: item.phase,
    itemKind: item.kind,
    questionSource: item.source,
    openingQuestionId: item.openingQuestionId,
    competencyKey: item.competencyKey,
    questionId: item.questionId,
    isFollowUp: item.isFollowUp,
    difficulty: item.level,
    questionText: item.questionText,
    sayText: directive.sayText,
    strategistOutput: {
      idealPoints: item.idealPoints,
      redFlags: item.redFlags,
      lookFor: item.lookFor,
      followUpType: item.followUpType,
      parentSource: item.parentSource,
      parentQuestionId: item.parentQuestionId,
    },
  };
}
async function interviewContext(
  session: SessionRow,
): Promise<InterviewContext> {
  if (!session.plan) fail("CONFLICT", "Prepare the interview first.");
  const [{ db }, profile] = await Promise.all([
    import("@/lib/db"),
    getProfile(session.userId),
  ]);
  const [cv] = session.cvId
    ? await (
        await db()
      )
        .select({ parsed: candidateCvs.parsed })
        .from(candidateCvs)
        .where(eq(candidateCvs.id, session.cvId))
    : [];
  return {
    config: session.config,
    plan: session.plan,
    company: session.company,
    roleTitle: session.roleTitle,
    firstName: (cv?.parsed?.full_name || profile?.fullName || "there")
      .trim()
      .split(/\s+/)[0],
  };
}
export const startSession = route(async (request, context: Params<"id">) => {
  const { session, database } = await requireSessionAccess(
    (await context.params).id,
    owner,
  );
  const { t0EpochMs } = await body(
    request,
    z.object({
      t0EpochMs: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    }),
  );
  const interview = await interviewContext(session);
  return database.transaction(async (tx) => {
    const [s] = await tx
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.id, session.id))
      .for("update");
    if (s.status === "in_progress" && s.strategistState)
      return json({
        directive: s.strategistState.lastDirective,
        t0EpochMs: s.t0EpochMs,
      });
    if (
      s.status !== "ready" ||
      !s.calibration ||
      !s.consent ||
      (s.kind === "company" && !s.consent.shareWithCompany)
    )
      fail("CONFLICT", "Complete setup and consent before starting.");
    if (s.config.requireHeadphones && !s.calibration.headphones)
      fail("CONFLICT", "Headphones are required for this interview.");
    const state = startInterview(interview);
    const at = new Date();
    if (s.kind === "company" && s.invitationId && s.openingId) {
      const [invite] = await tx
        .select()
        .from(invitations)
        .where(eq(invitations.id, s.invitationId))
        .for("update");
      if (!invite || invite.status !== "accepted" || invite.sessionId !== s.id)
        fail("CONFLICT", "This invitation is no longer available.");
      await tx
        .update(invitations)
        .set({ status: "started" })
        .where(eq(invitations.id, invite.id));
      await tx
        .update(openings)
        .set({ locked: true, updatedAt: at })
        .where(eq(openings.id, s.openingId));
    }
    await tx
      .insert(turns)
      .values(itemRow(s.id, state.current, state.lastDirective));
    await tx
      .update(interviewSessions)
      .set({
        status: "in_progress",
        startedAt: at,
        lastActiveAt: at,
        t0EpochMs,
        strategistState: state,
      })
      .where(eq(interviewSessions.id, s.id));
    return json({ directive: state.lastDirective });
  });
});

export const strategist = route(async (request, context: Params<"id">) => {
  const { session, database } = await requireSessionAccess(
    (await context.params).id,
    owner,
  );
  const input: StrategistInput = await body(request, strategistInput);
  if (session.status !== "in_progress" || !session.strategistState)
    fail("CONFLICT", "This interview is not running.");
  if (input.directiveSeq < session.strategistState.lastDirective.seq)
    return json({ directive: session.strategistState.lastDirective });
  const interview = await interviewContext(session);
  try {
    return await database.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(interviewSessions)
        .where(eq(interviewSessions.id, session.id))
        .for("update");
      const state = current.strategistState;
      if (!state || current.status !== "in_progress")
        return json({ directive: session.strategistState!.lastDirective });
      if (
        input.directiveSeq !== state.lastDirective.seq ||
        input.turnIdx !== state.turnIdx
      )
        return json({ directive: state.lastDirective });
      const evaluation = shouldScore(state, current.config, input)
        ? await evaluateAnswer(current, state, input)
        : undefined;
      const challenge =
        input.event === "presentation_interrupt" &&
        state.llmCalls < current.config.maxStrategistCalls
          ? await interruptChallenge(current, input.transcript)
          : undefined;
      const next = transition(state, interview, input, evaluation, challenge);
      if (next.idempotent) return json({ directive: state.lastDirective });
      const where = and(
        eq(turns.sessionId, session.id),
        eq(turns.idx, state.turnIdx),
      );
      const [row] = await tx.select().from(turns).where(where);
      if (next.clarification) {
        await tx
          .update(turns)
          .set({
            strategistOutput: {
              ...row?.strategistOutput,
              clarifications: [
                ...(row?.strategistOutput?.clarifications ?? []),
                next.clarification,
              ],
            },
          })
          .where(where);
      }
      if (next.scores) {
        const timing = input.timings;
        await tx
          .update(turns)
          .set({
            ...timing,
            answerStatus:
              next.scores.intent === "skip_request"
                ? "skipped"
                : input.answerStatus,
            answerTranscriptLive: input.transcript,
            liveMetrics: input.metrics,
            scores: next.scores,
            scoreTotal: next.scores.total,
            strategistOutput: {
              ...row?.strategistOutput,
              evaluated: evaluation?.output,
              nextDecision: next.state.current.kind,
            },
          })
          .where(where);
        const source = session.aiMode === "pipeline" ? "pipeline" : "live";
        const segments: (typeof transcriptSegments.$inferInsert)[] = [
          {
            sessionId: session.id,
            turnIdx: state.turnIdx,
            speaker: "ai",
            source,
            startMs: timing.askStartMs,
            endMs: Math.max(timing.askStartMs, timing.askEndMs),
            text: row?.sayText ?? state.lastDirective.sayText,
          },
        ];
        if (input.transcript.trim())
          segments.push({
            sessionId: session.id,
            turnIdx: state.turnIdx,
            speaker: "candidate",
            source,
            startMs: timing.answerStartMs ?? timing.askEndMs,
            endMs: timing.answerEndMs,
            text: input.transcript,
          });
        for (const segment of segments) {
          const [existing] = await tx
            .select({ id: transcriptSegments.id })
            .from(transcriptSegments)
            .where(
              and(
                eq(transcriptSegments.sessionId, segment.sessionId),
                eq(transcriptSegments.speaker, segment.speaker),
                eq(transcriptSegments.startMs, segment.startMs),
                eq(transcriptSegments.endMs, segment.endMs),
              ),
            )
            .limit(1);
          if (!existing) await tx.insert(transcriptSegments).values(segment);
        }
      }
      const directive = next.state.lastDirective;
      if (directive.turnIdx > state.turnIdx)
        await tx
          .insert(turns)
          .values(itemRow(session.id, next.state.current, directive))
          .onConflictDoNothing();
      else if (directive.mode === "presentation_begin")
        await tx
          .update(turns)
          .set({ sayText: directive.sayText, questionSource: "system" })
          .where(where);
      await tx
        .update(interviewSessions)
        .set({ lastActiveAt: new Date(), strategistState: next.state })
        .where(eq(interviewSessions.id, session.id));
      return json({ directive });
    });
  } catch {
    console.warn("SkillMirror strategist used its recovery directive");
    const prior = session.strategistState.lastDirective;
    const directive = {
      ...prior,
      seq: prior.seq + 1,
      mode: "ask" as const,
      sayText:
        "Sorry about that. Could you expand a little on your last answer?",
    };
    await database
      .update(interviewSessions)
      .set({
        strategistState: {
          ...session.strategistState,
          lastDirective: directive,
        },
      })
      .where(
        and(
          eq(interviewSessions.id, session.id),
          sql`(${interviewSessions.strategistState}->'lastDirective'->>'seq')::int = ${prior.seq}`,
        ),
      )
      .catch(() => {});
    return json({ directive });
  }
});

const nextStep = {
  name: "next_step",
  behavior: Behavior.NON_BLOCKING,
  description:
    "Call exactly once when the candidate has clearly finished answering the current question, explicitly asks to skip it, or says they have no more questions. Do NOT call it for clarification requests or while the candidate is still thinking. Before calling it, say only a brief neutral acknowledgement.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      reason: {
        type: Type.STRING,
        enum: ["answer_complete", "skip_requested", "no_more_questions"],
      },
    },
    required: ["reason"],
  },
};
export const observationKinds = [
  "second_person",
  "reading_notes",
  "phone_use",
  "left_frame",
  "looking_off_screen",
  "nervous_gesture",
  "confident_gesture",
  "other",
];
const flagObservation = {
  name: "flag_observation",
  behavior: Behavior.NON_BLOCKING,
  description:
    "Call silently, without saying anything about it, when you see something on camera a human interviewer would note: another person, the candidate reading from notes, a phone or another screen, leaving the frame, eating, or a clearly nervous or clearly confident gesture.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      type: { type: Type.STRING, enum: observationKinds },
      description: { type: Type.STRING, maxLength: "120" },
    },
    required: ["type", "description"],
  },
};
export const token = route(async (request) => {
  const { sessionId, resumptionHandle } = await body(
    request,
    z.object({
      sessionId: z.uuid(),
      resumptionHandle: z.string().max(4000).optional(),
    }),
  );
  const { session } = await requireSessionAccess(sessionId, owner);
  if (
    session.aiMode !== "live" ||
    !["ready", "in_progress"].includes(session.status)
  )
    fail("CONFLICT", "A live connection is unavailable for this interview.");
  const interview = await interviewContext(session);
  const model = serverEnv().MODEL_LIVE;
  const expiresAtEpochMs = Date.now() + LIVE_TOKEN_TTL_MS;
  const config: LiveConnectConfig = {
    responseModalities: [Modality.AUDIO],
    speechConfig: {
      voiceConfig: { prebuiltVoiceConfig: { voiceName: session.voiceName } },
    },
    systemInstruction: p5({
      interviewerName: interview.plan.persona.interviewer_name,
      interviewerStyle: interview.plan.persona.style.replace(/\.$/, ""),
      company: session.company,
      candidateFirstName: interview.firstName,
      seniority: session.seniority,
      roleTitle: session.roleTitle,
      toneInstructions: session.config.ai.toneInstructions,
    }),
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
    realtimeInputConfig: {
      automaticActivityDetection: {
        disabled: false,
        startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
        endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
        prefixPaddingMs: LIVE_VAD_PREFIX_MS,
        silenceDurationMs: LIVE_VAD_SILENCE_MS,
      },
      activityHandling: session.calibration?.echoSafe
        ? ActivityHandling.NO_INTERRUPTION
        : ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
    },
    contextWindowCompression: { slidingWindow: {} },
    sessionResumption: resumptionHandle ? { handle: resumptionHandle } : {},
    tools: [{ functionDeclarations: [nextStep, flagObservation] }],
  };
  try {
    const result = await gemini().authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(expiresAtEpochMs).toISOString(),
        newSessionExpireTime: new Date(
          Date.now() + LIVE_NEW_SESSION_MS,
        ).toISOString(),
        liveConnectConstraints: { model, config },
      },
    });
    if (!result.name)
      fail("AI_UNAVAILABLE", "The interviewer could not connect. Try again.");
    return json({ token: result.name, model, expiresAtEpochMs });
  } catch {
    fail("AI_UNAVAILABLE", "The interviewer could not connect. Try again.");
  }
});
