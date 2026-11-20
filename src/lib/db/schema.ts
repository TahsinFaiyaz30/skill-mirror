import { sql } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  bigserial,
  bigint,
  index,
  uniqueIndex,
  primaryKey,
  foreignKey,
  check,
  customType,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { ROLE_FAMILIES, SENIORITIES, PHASES } from "@/lib/config/taxonomy";
import {
  SESSION_KINDS,
  SESSION_STATUSES,
  END_REASONS,
  CATEGORIES,
  QUESTION_SOURCES,
  INVITE_STATUSES,
} from "@/types/interview";
import type {
  Baseline,
  Calibration,
  Consent,
  InterviewConfig,
  InterviewPlan,
  ItemKind,
  OpeningConfig,
  ParsedCV,
  SessionMedia,
  TurnMetricSummary,
  TurnScores,
  TurnTone,
  AnswerStatus,
} from "@/types/interview";
import type { StrategistState } from "@/lib/strategist/state";
import type {
  CertificatePayload,
  ReportData,
  FinalTurnMetrics,
} from "@/types/report";
import type { DocsDocument, DocsVisibilityMode } from "@/types/docs";

export const sessionKind = pgEnum("session_kind", SESSION_KINDS);
export const sessionStatus = pgEnum("session_status", SESSION_STATUSES);
export const seniority = pgEnum("seniority", SENIORITIES);
export const roleFamily = pgEnum("role_family", ROLE_FAMILIES);
export const phaseKey = pgEnum("phase_key", PHASES);
export const endReason = pgEnum("end_reason", END_REASONS);
export const speaker = pgEnum("speaker", ["ai", "candidate"]);
export const transcriptSource = pgEnum("transcript_source", [
  "live",
  "whisper",
  "pipeline",
]);
export const eventCategory = pgEnum("event_category", CATEGORIES);
export const reportStatus = pgEnum("report_status", [
  "queued",
  "running",
  "completed",
  "failed",
]);
export const parseStatus = pgEnum("parse_status", [
  "pending",
  "parsing",
  "parsed",
  "failed",
]);
export const questionSource = pgEnum("question_source", QUESTION_SOURCES);
export const orgRole = pgEnum("org_role", ["owner", "recruiter"]);
export const openingStatus = pgEnum("opening_status", [
  "draft",
  "active",
  "closed",
]);
export const invitationStatus = pgEnum("invitation_status", INVITE_STATUSES);
export const reviewDecision = pgEnum("review_decision", [
  "advance",
  "hold",
  "reject",
]);

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();
const timestampAt = (name: string) => timestamp(name, { withTimezone: true });
const id = () => uuid().defaultRandom().primaryKey();
const citext = customType<{ data: string }>({ dataType: () => "citext" });
import { authIdentity as authUsers } from "./authSchema";

export const profiles = pgTable("profiles", {
  id: uuid()
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  avatarUrl: text("avatar_url"),
  intent: text().$type<"practice" | "hiring">(),
  onboardedAt: timestampAt("onboarded_at"),
  createdAt: createdAt(),
}).enableRLS();
export const pendingAccountDeletions = pgTable("pending_account_deletions", {
  userId: uuid("user_id").primaryKey(),
  orgId: uuid("org_id"),
  createdAt: createdAt(),
}).enableRLS();
export const organizations = pgTable("organizations", {
  id: id(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  website: text(),
  logoPath: text("logo_path"),
  createdBy: uuid("created_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
}).enableRLS();
export const orgMembers = pgTable(
  "org_members",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: orgRole().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] })],
).enableRLS();
export const openings = pgTable(
  "openings",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text().notNull(),
    roleTitle: text("role_title").notNull(),
    roleFamily: roleFamily("role_family").notNull(),
    seniority: seniority().notNull(),
    department: text(),
    jobDescription: text("job_description"),
    status: openingStatus().default("draft").notNull(),
    config: jsonb().$type<OpeningConfig>().notNull(),
    locked: boolean().default(false).notNull(),
    createdBy: uuid("created_by").references(() => profiles.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    publishedAt: timestampAt("published_at"),
  },
  (t) => [index("openings_org_idx").on(t.orgId)],
).enableRLS();
export const openingQuestions = pgTable(
  "opening_questions",
  {
    id: id(),
    openingId: uuid("opening_id")
      .notNull()
      .references(() => openings.id, { onDelete: "cascade" }),
    orderIdx: integer("order_idx").notNull(),
    phase: phaseKey()
      .$type<"cv_deep_dive" | "behavioral" | "technical">()
      .notNull(),
    text: text().notNull(),
    competencyKey:
      text("competency_key").$type<
        import("@/lib/config/taxonomy").CompetencyKey
      >(),
    subLabel: text("sub_label"),
    difficulty: integer(),
    mustAsk: boolean("must_ask").default(true).notNull(),
    maxFollowUps: integer("max_follow_ups").default(1).notNull(),
    idealPoints: text("ideal_points").array().notNull(),
    redFlags: text("red_flags").array().notNull(),
    expectedMinutes: real("expected_minutes").default(2).notNull(),
    origin: text().$type<"manual" | "imported" | "ai_generated">().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("opening_questions_order_idx").on(t.openingId, t.orderIdx)],
).enableRLS();
export const candidateCvs = pgTable(
  "candidate_cvs",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull(),
    fileName: text("file_name").notNull(),
    pageCount: integer("page_count"),
    parseStatus: parseStatus("parse_status").default("pending").notNull(),
    parsed: jsonb().$type<ParsedCV>(),
    error: text(),
    createdAt: createdAt(),
  },
  (t) => [index("candidate_cvs_user_idx").on(t.userId)],
).enableRLS();
export const interviewSessions = pgTable(
  "interview_sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    kind: sessionKind().default("practice").notNull(),
    orgId: uuid("org_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    openingId: uuid("opening_id").references(() => openings.id, {
      onDelete: "cascade",
    }),
    invitationId: uuid("invitation_id"),
    organizationRemoved: boolean("organization_removed")
      .default(false)
      .notNull(),
    cvId: uuid("cv_id").references(() => candidateCvs.id, {
      onDelete: "set null",
    }),
    company: text().notNull(),
    roleTitle: text("role_title").notNull(),
    roleFamily: roleFamily("role_family").notNull(),
    seniority: seniority().notNull(),
    jobDescription: text("job_description"),
    lengthMinutes: integer("length_minutes").notNull(),
    voiceName: text("voice_name").$type<"Kore" | "Charon">().notNull(),
    aiMode: text("ai_mode").$type<"live" | "pipeline" | "mock">().notNull(),
    status: sessionStatus().default("draft").notNull(),
    config: jsonb().$type<InterviewConfig>().notNull(),
    plan: jsonb().$type<InterviewPlan>(),
    strategistState: jsonb("strategist_state").$type<StrategistState>(),
    calibration: jsonb().$type<Calibration>(),
    baseline: jsonb().$type<Baseline>(),
    t0EpochMs: bigint("t0_epoch_ms", { mode: "number" }),
    startedAt: timestampAt("started_at"),
    lastActiveAt: timestampAt("last_active_at"),
    endedAt: timestampAt("ended_at"),
    durationMs: integer("duration_ms"),
    endReason: endReason("end_reason"),
    media: jsonb().$type<SessionMedia>().default({}).notNull(),
    consent: jsonb().$type<Consent>(),
    error: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index("interview_sessions_user_created_idx").on(
      t.userId,
      t.createdAt.desc(),
    ),
    foreignKey({
      columns: [t.invitationId],
      foreignColumns: [invitations.id],
      name: "interview_sessions_invitation_fk",
    }).onDelete("set null"),
    check(
      "interview_sessions_scope_check",
      sql`
      (${t.kind} = 'practice' AND ${t.lengthMinutes} IN (2,10,20)
        AND ${t.orgId} IS NULL AND ${t.openingId} IS NULL AND NOT ${t.organizationRemoved})
      OR (${t.kind} IN ('company','preview') AND ${t.lengthMinutes} IN (2,15,20,30,45)
        AND (
          (NOT ${t.organizationRemoved} AND ${t.orgId} IS NOT NULL AND ${t.openingId} IS NOT NULL)
          OR (${t.organizationRemoved} AND ${t.orgId} IS NULL AND ${t.openingId} IS NULL AND ${t.invitationId} IS NULL)
        ))
    `,
    ),
  ],
).enableRLS();
export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    openingId: uuid("opening_id")
      .notNull()
      .references(() => openings.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: citext().notNull(),
    name: text(),
    token: text().notNull().unique(),
    status: invitationStatus().default("pending").notNull(),
    expiresAt: timestampAt("expires_at").notNull(),
    candidateUserId: uuid("candidate_user_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    sessionId: uuid("session_id").references(
      (): AnyPgColumn => interviewSessions.id,
      { onDelete: "set null" },
    ),
    createdBy: uuid("created_by").references(() => profiles.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    lastSentAt: timestampAt("last_sent_at"),
  },
  (t) => [
    index("invitations_status_idx").on(t.openingId, t.status),
    uniqueIndex("invitations_active_email_idx")
      .on(t.openingId, t.email)
      .where(sql`${t.status} in ('pending', 'accepted', 'started')`),
  ],
).enableRLS();
export const candidateReviews = pgTable("candidate_reviews", {
  sessionId: uuid("session_id")
    .primaryKey()
    .references(() => interviewSessions.id, { onDelete: "cascade" }),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  reviewerId: uuid("reviewer_id").references(() => profiles.id, {
    onDelete: "set null",
  }),
  decision: reviewDecision(),
  rating: integer(),
  notes: text().default("").notNull(),
  updatedAt: updatedAt(),
}).enableRLS();
const forSession = () =>
  uuid("session_id")
    .notNull()
    .references(() => interviewSessions.id, { onDelete: "cascade" });
export const turns = pgTable(
  "turns",
  {
    id: id(),
    sessionId: forSession(),
    idx: integer().notNull(),
    phase: phaseKey().notNull(),
    itemKind: text("item_kind").$type<ItemKind>().notNull(),
    questionSource: questionSource("question_source")
      .default("ai_plan")
      .notNull(),
    openingQuestionId: uuid("opening_question_id"),
    competencyKey: text("competency_key"),
    questionId: text("question_id"),
    isFollowUp: boolean("is_follow_up").default(false).notNull(),
    difficulty: integer(),
    questionText: text("question_text").notNull(),
    sayText: text("say_text").notNull(),
    askStartMs: integer("ask_start_ms"),
    askEndMs: integer("ask_end_ms"),
    answerStartMs: integer("answer_start_ms"),
    answerEndMs: integer("answer_end_ms"),
    answerStatus: text("answer_status").$type<AnswerStatus>(),
    answerTranscriptLive: text("answer_transcript_live"),
    answerTranscriptFinal: text("answer_transcript_final"),
    scores: jsonb().$type<TurnScores>(),
    scoreTotal: real("score_total"),
    strategistOutput: jsonb("strategist_output").$type<{
      clarifications?: { request: string; reply: string }[];
      [key: string]: unknown;
    }>(),
    liveMetrics: jsonb("live_metrics").$type<TurnMetricSummary>(),
    finalMetrics: jsonb("final_metrics").$type<FinalTurnMetrics>(),
    tone: jsonb().$type<TurnTone>(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("turns_session_idx").on(t.sessionId, t.idx)],
).enableRLS();
export const transcriptSegments = pgTable(
  "transcript_segments",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    sessionId: forSession(),
    speaker: speaker().notNull(),
    source: transcriptSource().notNull(),
    turnIdx: integer("turn_idx"),
    text: text().notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
  },
  (t) => [index("transcript_start_idx").on(t.sessionId, t.startMs)],
).enableRLS();
export const events = pgTable(
  "events",
  {
    id: uuid().primaryKey(),
    sessionId: forSession(),
    category: eventCategory().notNull(),
    type: text().notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    severity: real().notNull(),
    turnIdx: integer("turn_idx"),
    data: jsonb().$type<Record<string, unknown>>().default({}).notNull(),
    snapshotPath: text("snapshot_path"),
  },
  (t) => [index("events_start_idx").on(t.sessionId, t.startMs)],
).enableRLS();
export const reports = pgTable("reports", {
  sessionId: forSession().primaryKey(),
  status: reportStatus().notNull(),
  progress: integer().default(0).notNull(),
  step: text().default("verify_media").notNull(),
  stepsDone: text("steps_done")
    .array()
    .default(sql`'{}'::text[]`)
    .notNull(),
  overallScore: integer("overall_score"),
  verdict: text(),
  data: jsonb().$type<ReportData>(),
  error: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  completedAt: timestampAt("completed_at"),
}).enableRLS();
export const competencyResults = pgTable(
  "competency_results",
  {
    id: id(),
    sessionId: forSession(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    competencyKey: text("competency_key").notNull(),
    subLabel: text("sub_label"),
    ceiling: integer(),
    bracketed: boolean().notNull(),
    theta: real().notNull(),
    score: integer().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("competency_results_history_idx").on(
      t.userId,
      t.competencyKey,
      t.createdAt,
    ),
  ],
).enableRLS();
export const softSkillResults = pgTable(
  "soft_skill_results",
  {
    id: id(),
    sessionId: forSession(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    dimension: text().notNull(),
    score: integer().notNull(),
    level: integer().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("soft_skill_results_user_idx").on(t.userId)],
).enableRLS();
export const certificates = pgTable("certificates", {
  slug: text().primaryKey(),
  sessionId: forSession().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  payload: jsonb().$type<CertificatePayload>().notNull(),
  signature: text().notNull(),
  revoked: boolean().default(false).notNull(),
  createdAt: createdAt(),
}).enableRLS();

export const docsConfig = pgTable("docs_config", {
  id: text().primaryKey().default("primary"),
  visibilityMode: text("visibility_mode")
    .$type<DocsVisibilityMode>()
    .default("on")
    .notNull(),
  scheduleStart: timestamp("schedule_start", { withTimezone: true })
    .default(sql`'2026-06-10T00:00:00Z'::timestamptz`)
    .notNull(),
  scheduleEnd: timestamp("schedule_end", { withTimezone: true })
    .default(sql`'2026-06-14T23:59:59Z'::timestamptz`)
    .notNull(),
  durationStartedAt: timestampAt("duration_started_at"),
  durationHours: integer("duration_hours"),
  publishedVersion: integer("published_version").default(1).notNull(),
  draft: jsonb().$type<DocsDocument>().notNull(),
  published: jsonb().$type<DocsDocument>().notNull(),
  updatedBy: uuid("updated_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  updatedAt: updatedAt(),
  publishedAt: timestamp("published_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}).enableRLS();

export const docsRevisions = pgTable("docs_revisions", {
  id: id(),
  version: integer().notNull().unique(),
  summary: text().default("").notNull(),
  snapshot: jsonb().$type<DocsDocument>().notNull(),
  publishedBy: uuid("published_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
}).enableRLS();

export type SessionRow = typeof interviewSessions.$inferSelect;
export type TurnRow = typeof turns.$inferSelect;
export type OpeningRow = typeof openings.$inferSelect;
export type OrgRow = typeof organizations.$inferSelect;
export type InviteRow = typeof invitations.$inferSelect;
export type ProfileRow = typeof profiles.$inferSelect;
export type DocsConfigRow = typeof docsConfig.$inferSelect;
export type DocsRevisionRow = typeof docsRevisions.$inferSelect;
