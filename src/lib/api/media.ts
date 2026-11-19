import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireSessionAccess } from "@/lib/auth/guards";
import {
  events,
  interviewSessions,
  invitations,
  reports,
  transcriptSegments,
} from "@/lib/db/schema";
import { PARTIAL_MIN_MS } from "@/lib/config/constants";
import {
  END_REASONS,
  CATEGORIES,
  type SessionMedia,
  type SessionStatus,
} from "@/types/interview";
import { uploadURL, type Bucket } from "@/lib/supabase/storage";
import { finalizeCoverage } from "@/lib/strategist/engine";
import { defaultCalibration } from "@/lib/vision/features";
import { computeBaseline } from "@/lib/vision/aggregator";
import { integrityOnly } from "@/lib/vision/integrity";
import { captureFiles, SEGMENTS_PER_CAPTURE } from "@/lib/recording/captures";
import { body, fail, json, ok, route, type Params } from "@/lib/utils/http";
import { ms } from "./live";
import { interrupted, owner } from "./session";

const bytes = z.number().int().nonnegative().max(52428800);
const object = z.object({ path: z.string().max(255), bytes });
const recording = object.extend({
  index: z.number().int().nonnegative().max(2147483647),
  startMs: ms,
  endMs: ms,
  uploaded: z.boolean(),
});
const mediaSchema = z.object({
  videoSegments: z.array(recording).max(100).optional(),
  micAudio: object.extend({ durationMs: ms, startOffsetMs: ms }).optional(),
  timeline: object.optional(),
  landmarks: object.optional(),
  pitch: object.optional(),
  snapshotsCount: z.number().int().min(0).max(40).optional(),
});
const baselineSchema = z.object({
  fields: z.object({
    eyeContact: z.number(),
    blinkPerMin: z.number(),
    smile: z.number(),
    browTension: z.number(),
    lipPress: z.number(),
    expressiveness: z.number(),
    fidgetFrac: z.number(),
    gestureFrac: z.number(),
    selfTouchPerMin: z.number(),
    neckRatio: z.number(),
    swayStd: z.number(),
    rmsDb: z.number(),
    pitchMedianSt: z.number().nullable(),
    pitchRangeSt: z.number(),
    wpm: z.number(),
    fillerPerMin: z.number(),
    hedgePerMin: z.number(),
  }),
  source: z.enum(["measured", "default"]),
  window: z.object({ startMs: ms, endMs: ms }),
});
const uploadKind = z.enum([
  "video_segment",
  "mic_audio",
  "timeline",
  "landmarks",
  "pitch",
  "snapshot",
]);
const eventSchema = z.object({
  id: z.uuid(),
  category: z.enum(CATEGORIES),
  type: z.string().min(1).max(80),
  startMs: ms,
  endMs: ms,
  severity: z.number().min(0).max(1),
  turnIdx: z.number().int().nonnegative().nullable(),
  data: z.record(z.string(), z.unknown()),
  snapshotPath: z.string().max(255).nullable(),
});
const videoPath = (prefix: string, index: number) =>
  prefix + "/video/seg-" + String(index).padStart(3, "0") + ".webm";
const micPath = (prefix: string) => prefix + "/audio/mic.webm";
const artifactPaths = {
  timeline: "timeline.json.gz",
  landmarks: "landmarks.bin.gz",
  pitch: "pitch.bin.gz",
};
const snapshotPath = (prefix: string, eventId: string) =>
  prefix + "/snapshots/" + eventId + ".jpg";
const capturePrefix = (prefix: string, capture: number) =>
  capture ? prefix + "/captures/" + capture : prefix;
function validateMedia(prefix: string, media: SessionMedia, capture = 0) {
  const part = capturePrefix(prefix, capture);
  if (
    media.videoSegments?.some(
      (s) =>
        Math.floor(s.index / SEGMENTS_PER_CAPTURE) !== capture ||
        s.path !== videoPath(prefix, s.index) ||
        s.endMs < s.startMs,
    ) ||
    (media.micAudio && media.micAudio.path !== micPath(part)) ||
    (Object.keys(artifactPaths) as (keyof typeof artifactPaths)[]).some(
      (key) =>
        media[key] && media[key]?.path !== part + "/" + artifactPaths[key],
    )
  )
    fail("BAD_REQUEST", "Invalid session recording path.");
}
function mergeMedia(
  previous: SessionMedia,
  current: SessionMedia,
  capture = 0,
) {
  const video = new Map(
    (previous.videoSegments ?? []).map((item) => [item.index, item]),
  );
  for (const item of current.videoSegments ?? [])
    video.set(item.index, { ...video.get(item.index), ...item });
  const { micAudio, timeline, landmarks, pitch } = current;
  const part = {
    ...(micAudio && { micAudio }),
    ...(timeline && { timeline }),
    ...(landmarks && { landmarks }),
    ...(pitch && { pitch }),
  };
  const files = capture
    ? {
        additionalCaptures: {
          ...previous.additionalCaptures,
          [capture]: { ...previous.additionalCaptures?.[capture], ...part },
        },
      }
    : part;
  return {
    ...previous,
    ...files,
    ...(current.snapshotsCount !== undefined && {
      snapshotsCount: Math.max(
        previous.snapshotsCount ?? 0,
        current.snapshotsCount,
      ),
    }),
    videoSegments: [...video.values()].sort((a, b) => a.index - b.index),
  };
}
function requireMediaWriteStatus(status: SessionStatus) {
  if (!["in_progress", "ended", "processing", "failed"].includes(status)) {
    fail("CONFLICT", "This interview is not accepting media or telemetry.");
  }
}
export const mediaUpload = route(async (request, context: Params<"id">) => {
  const { session } = await requireSessionAccess(
    (await context.params).id,
    owner,
  );
  requireMediaWriteStatus(session.status);
  if (session.media.deleted)
    fail("CONFLICT", "Recording retention has expired for this interview.");
  const { kind, index, eventId, captureIndex } = await body(
    request,
    z.object({
      kind: uploadKind,
      index: recording.shape.index.optional(),
      captureIndex: z.number().int().nonnegative().default(0),
      eventId: z.uuid().optional(),
    }),
  );
  const prefix = session.userId + "/" + session.id;
  if (captureIndex && !session.media.captureIds?.[captureIndex])
    fail("BAD_REQUEST", "Unknown recording capture.");
  const part = capturePrefix(prefix, captureIndex);
  if (
    session.config.evaluation.nonverbalPolicy === "off" &&
    kind !== "video_segment" &&
    kind !== "mic_audio"
  )
    fail("FORBIDDEN", "Delivery analysis is disabled for this interview.");
  const bucket: Bucket =
    kind === "video_segment" || kind === "mic_audio"
      ? "recordings"
      : "artifacts";
  let path: string;
  if (kind === "video_segment") {
    if (index === undefined) fail("BAD_REQUEST", "Supply a segment index.");
    if (Math.floor(index / SEGMENTS_PER_CAPTURE) !== captureIndex)
      fail("BAD_REQUEST", "Invalid segment index.");
    path = videoPath(prefix, index);
  } else if (kind === "mic_audio") path = micPath(part);
  else if (kind === "snapshot") {
    if (!eventId) fail("BAD_REQUEST", "Supply the snapshot event ID.");
    path = snapshotPath(prefix, eventId);
  } else path = part + "/" + artifactPaths[kind];
  return json(
    await uploadURL(
      bucket,
      path,
      kind !== "video_segment" && kind !== "snapshot",
    ),
  );
});
export const patchMediaRoute = route(async (request, context: Params<"id">) => {
  const { session, database } = await requireSessionAccess(
    (await context.params).id,
    owner,
  );
  const { captureIndex, ...media } = await body(
    request,
    mediaSchema.extend({
      captureIndex: z.number().int().nonnegative().default(0),
    }),
  );
  if (captureIndex && !session.media.captureIds?.[captureIndex])
    fail("BAD_REQUEST", "Unknown recording capture.");
  if (
    session.config.evaluation.nonverbalPolicy === "off" &&
    (media.timeline || media.landmarks || media.pitch)
  )
    fail("FORBIDDEN", "Delivery analysis is disabled for this interview.");
  validateMedia(session.userId + "/" + session.id, media, captureIndex);
  return database.transaction(async (tx) => {
    const [s] = await tx
      .select({
        media: interviewSessions.media,
        status: interviewSessions.status,
      })
      .from(interviewSessions)
      .where(eq(interviewSessions.id, session.id))
      .for("update");
    if (!s) fail("NOT_FOUND", "Interview not found.");
    requireMediaWriteStatus(s.status);
    if (s.media.deleted)
      fail("CONFLICT", "Recording retention has expired for this interview.");
    await tx
      .update(interviewSessions)
      .set({ media: mergeMedia(s.media, media, captureIndex) })
      .where(eq(interviewSessions.id, session.id));
    return ok();
  });
});
export const telemetry = route(async (request, context: Params<"id">) => {
  const { session, database } = await requireSessionAccess(
    (await context.params).id,
    owner,
  );
  const input = await body(
    request,
    z.object({
      events: z.array(eventSchema).max(500).optional(),
      transcripts: z
        .array(
          z.object({
            speaker: z.enum(["ai", "candidate"]),
            text: z.string().max(12000),
            startMs: ms,
            endMs: ms,
            turnIdx: z.number().int().nonnegative().nullable(),
          }),
        )
        .max(200)
        .optional(),
    }),
  );
  const items =
      session.config.evaluation.nonverbalPolicy === "off"
        ? (input.events ?? [])
            .filter(integrityOnly)
            .map((event) => ({ ...event, data: {}, snapshotPath: null }))
        : (input.events ?? []),
    transcripts = input.transcripts ?? [];
  const prefix = session.userId + "/" + session.id;
  for (const event of items)
    if (
      event.endMs < event.startMs ||
      (event.snapshotPath &&
        event.snapshotPath !== snapshotPath(prefix, event.id))
    )
      fail("BAD_REQUEST", "Invalid event timing or path.");
  await database.transaction(async (tx) => {
    const [current] = await tx
      .select({ status: interviewSessions.status })
      .from(interviewSessions)
      .where(eq(interviewSessions.id, session.id))
      .for("update");
    if (!current) fail("NOT_FOUND", "Interview not found.");
    requireMediaWriteStatus(current.status);
    for (const item of new Map(items.map((e) => [e.id, e])).values()) {
      await tx
        .insert(events)
        .values({ ...item, sessionId: session.id })
        .onConflictDoUpdate({
          target: events.id,
          set: {
            endMs: item.endMs,
            severity: item.severity,
            data: item.data,
            snapshotPath: item.snapshotPath,
          },
          setWhere: eq(events.sessionId, session.id),
        });
    }
    for (const item of transcripts)
      if (item.text.trim() && item.startMs <= item.endMs) {
        const existing = await tx
          .select({ id: transcriptSegments.id })
          .from(transcriptSegments)
          .where(
            and(
              eq(transcriptSegments.sessionId, session.id),
              eq(transcriptSegments.speaker, item.speaker),
              eq(transcriptSegments.startMs, item.startMs),
              eq(transcriptSegments.endMs, item.endMs),
            ),
          )
          .limit(1);
        if (!existing.length)
          await tx.insert(transcriptSegments).values({
            ...item,
            source: session.aiMode === "pipeline" ? "pipeline" : "live",
            sessionId: session.id,
          });
        else if (item.speaker === "ai")
          await tx
            .update(transcriptSegments)
            .set({ text: item.text })
            .where(eq(transcriptSegments.id, existing[0].id));
      }
    await tx
      .update(interviewSessions)
      .set({ lastActiveAt: new Date() })
      .where(
        and(
          eq(interviewSessions.id, session.id),
          eq(interviewSessions.status, "in_progress"),
        ),
      );
  });
  return json({
    ok: true,
    eventsAccepted: items.length,
    transcriptsAccepted: transcripts.length,
  });
});
export const endSession = route(async (request, context: Params<"id">) => {
  const { session, database } = await requireSessionAccess(
    (await context.params).id,
    owner,
  );
  const input = await body(
    request,
    z.object({
      endReason: z.enum(END_REASONS),
      durationMs: ms,
      baseline: baselineSchema.nullable(),
      media: mediaSchema,
    }),
  );
  validateMedia(session.userId + "/" + session.id, input.media);
  const off = session.config.evaluation.nonverbalPolicy === "off";
  if (
    off &&
    (input.media.timeline || input.media.landmarks || input.media.pitch)
  )
    fail("FORBIDDEN", "Delivery analysis is disabled for this interview.");
  return database.transaction(async (tx) => {
    const [s] = await tx
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.id, session.id))
      .for("update");
    if (["ended", "processing", "completed"].includes(s.status))
      return json({ ok: true, status: s.status });
    if (s.status !== "in_progress")
      fail("CONFLICT", "This interview is not running.");
    const summary = s.strategistState;
    if (summary) finalizeCoverage(summary);
    await tx
      .update(interviewSessions)
      .set({
        status: "ended",
        endedAt: new Date(),
        baseline: off ? null : input.baseline,
        endReason: input.endReason,
        durationMs: Math.min(s.config.hardCapMs, input.durationMs),
        media: mergeMedia(s.media, input.media),
        strategistState: summary,
      })
      .where(eq(interviewSessions.id, s.id));
    await tx
      .insert(reports)
      .values({ sessionId: s.id, status: "queued" })
      .onConflictDoNothing();
    if (s.kind === "company" && s.invitationId)
      await tx
        .update(invitations)
        .set({ status: "completed" })
        .where(
          and(
            eq(invitations.id, s.invitationId),
            eq(invitations.sessionId, s.id),
          ),
        );
    return ok();
  });
});
export const partialSession = route(async (_request, context: Params<"id">) => {
  const { session, database } = await requireSessionAccess(
    (await context.params).id,
    owner,
  );
  if (session.kind === "company" || !interrupted(session))
    fail(
      "CONFLICT",
      "Only interrupted practice or preview interviews can be processed here.",
    );
  const elapsed = Math.max(
    ...(session.media.videoSegments ?? []).map((s) => s.endMs),
    ...captureFiles(session.media).map(
      (part) => part.micAudio?.durationMs ?? 0,
    ),
  );
  if (elapsed < PARTIAL_MIN_MS)
    fail(
      "CONFLICT",
      "Record at least five minutes to generate a partial report.",
    );
  await database.transaction(async (tx) => {
    const [saved] = await tx
      .update(interviewSessions)
      .set({
        status: "ended",
        endedAt: new Date(),
        endReason: "interrupted",
        durationMs: elapsed,
        baseline:
          session.baseline ??
          computeBaseline(
            [],
            [],
            session.calibration ?? defaultCalibration,
            null,
            null,
          ),
      })
      .where(
        and(
          eq(interviewSessions.id, session.id),
          eq(interviewSessions.status, "in_progress"),
          sql`${interviewSessions.lastActiveAt} < now() - interval '10 minutes'`,
        ),
      )
      .returning();
    if (!saved)
      fail("CONFLICT", "This interview is already processing or active.");
    await tx
      .insert(reports)
      .values({ sessionId: session.id, status: "queued" })
      .onConflictDoNothing();
  });
  return ok();
});
