CREATE EXTENSION IF NOT EXISTS citext;
CREATE TYPE "public"."end_reason" AS ENUM('completed', 'hard_cap', 'user_ended', 'connection_lost', 'interrupted');--> statement-breakpoint
CREATE TYPE "public"."event_category" AS ENUM('nonverbal', 'vocal', 'integrity', 'live_vision', 'positive');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'started', 'completed', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."opening_status" AS ENUM('draft', 'active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."org_role" AS ENUM('owner', 'recruiter');--> statement-breakpoint
CREATE TYPE "public"."parse_status" AS ENUM('pending', 'parsing', 'parsed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."phase_key" AS ENUM('intro_calibration', 'cv_deep_dive', 'behavioral', 'technical', 'presentation', 'candidate_questions', 'close');--> statement-breakpoint
CREATE TYPE "public"."question_source" AS ENUM('company', 'ai_plan', 'ai_followup', 'system');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('queued', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."review_decision" AS ENUM('advance', 'hold', 'reject');--> statement-breakpoint
CREATE TYPE "public"."role_family" AS ENUM('software_engineering', 'data_ml', 'product', 'design', 'other');--> statement-breakpoint
CREATE TYPE "public"."seniority" AS ENUM('intern', 'junior', 'mid', 'senior', 'staff');--> statement-breakpoint
CREATE TYPE "public"."session_kind" AS ENUM('practice', 'company', 'preview');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('draft', 'planning', 'ready', 'in_progress', 'ended', 'processing', 'completed', 'failed', 'discarded', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."speaker" AS ENUM('ai', 'candidate');--> statement-breakpoint
CREATE TYPE "public"."transcript_source" AS ENUM('live', 'whisper', 'pipeline');--> statement-breakpoint
CREATE TABLE "candidate_cvs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"file_name" text NOT NULL,
	"page_count" integer,
	"parse_status" "parse_status" DEFAULT 'pending' NOT NULL,
	"parsed" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidate_cvs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "candidate_reviews" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"decision" "review_decision",
	"rating" integer,
	"notes" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidate_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "certificates" (
	"slug" text PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"signature" text NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certificates_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
ALTER TABLE "certificates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "competency_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"competency_key" text NOT NULL,
	"sub_label" text,
	"ceiling" integer,
	"bracketed" boolean NOT NULL,
	"theta" real NOT NULL,
	"score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competency_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"category" "event_category" NOT NULL,
	"type" text NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"severity" real NOT NULL,
	"turn_idx" integer,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"snapshot_path" text
);
--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "interview_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "session_kind" DEFAULT 'practice' NOT NULL,
	"org_id" uuid,
	"opening_id" uuid,
	"invitation_id" uuid,
	"cv_id" uuid,
	"company" text NOT NULL,
	"role_title" text NOT NULL,
	"role_family" "role_family" NOT NULL,
	"seniority" "seniority" NOT NULL,
	"job_description" text,
	"length_minutes" integer NOT NULL,
	"voice_name" text NOT NULL,
	"ai_mode" text NOT NULL,
	"status" "session_status" DEFAULT 'draft' NOT NULL,
	"config" jsonb NOT NULL,
	"plan" jsonb,
	"strategist_state" jsonb,
	"calibration" jsonb,
	"baseline" jsonb,
	"t0_epoch_ms" bigint,
	"started_at" timestamp with time zone,
	"last_active_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_ms" integer,
	"end_reason" "end_reason",
	"media" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"consent" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interview_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opening_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"email" "citext" NOT NULL,
	"name" text,
	"token" text NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"candidate_user_id" uuid,
	"session_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sent_at" timestamp with time zone,
	CONSTRAINT "invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "opening_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opening_id" uuid NOT NULL,
	"order_idx" integer NOT NULL,
	"phase" "phase_key" NOT NULL,
	"text" text NOT NULL,
	"competency_key" text,
	"sub_label" text,
	"difficulty" integer,
	"must_ask" boolean DEFAULT true NOT NULL,
	"max_follow_ups" integer DEFAULT 1 NOT NULL,
	"ideal_points" text[] NOT NULL,
	"red_flags" text[] NOT NULL,
	"expected_minutes" real DEFAULT 2 NOT NULL,
	"origin" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opening_questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "openings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"role_title" text NOT NULL,
	"role_family" "role_family" NOT NULL,
	"seniority" "seniority" NOT NULL,
	"department" text,
	"job_description" text,
	"status" "opening_status" DEFAULT 'draft' NOT NULL,
	"config" jsonb NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "openings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "org_members" (
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "org_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_members_org_id_user_id_pk" PRIMARY KEY("org_id","user_id"),
	CONSTRAINT "org_members_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "org_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"website" text,
	"logo_path" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"avatar_url" text,
	"intent" text,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reports" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"status" "report_status" NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"step" text DEFAULT 'verify_media' NOT NULL,
	"steps_done" text[] DEFAULT '{}'::text[] NOT NULL,
	"overall_score" integer,
	"verdict" text,
	"data" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "soft_skill_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"dimension" text NOT NULL,
	"score" integer NOT NULL,
	"level" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "soft_skill_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "transcript_segments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"speaker" "speaker" NOT NULL,
	"source" "transcript_source" NOT NULL,
	"turn_idx" integer,
	"text" text NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transcript_segments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"phase" "phase_key" NOT NULL,
	"item_kind" text NOT NULL,
	"question_source" "question_source" DEFAULT 'ai_plan' NOT NULL,
	"opening_question_id" uuid,
	"competency_key" text,
	"question_id" text,
	"is_follow_up" boolean DEFAULT false NOT NULL,
	"difficulty" integer,
	"question_text" text NOT NULL,
	"say_text" text NOT NULL,
	"ask_start_ms" integer,
	"ask_end_ms" integer,
	"answer_start_ms" integer,
	"answer_end_ms" integer,
	"answer_status" text,
	"answer_transcript_live" text,
	"answer_transcript_final" text,
	"scores" jsonb,
	"score_total" real,
	"strategist_output" jsonb,
	"live_metrics" jsonb,
	"final_metrics" jsonb,
	"tone" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "turns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "candidate_cvs" ADD CONSTRAINT "candidate_cvs_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_reviews" ADD CONSTRAINT "candidate_reviews_session_id_interview_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_reviews" ADD CONSTRAINT "candidate_reviews_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_reviews" ADD CONSTRAINT "candidate_reviews_reviewer_id_profiles_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_session_id_interview_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competency_results" ADD CONSTRAINT "competency_results_session_id_interview_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competency_results" ADD CONSTRAINT "competency_results_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_session_id_interview_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_opening_id_openings_id_fk" FOREIGN KEY ("opening_id") REFERENCES "public"."openings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_cv_id_candidate_cvs_id_fk" FOREIGN KEY ("cv_id") REFERENCES "public"."candidate_cvs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_invitation_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_opening_id_openings_id_fk" FOREIGN KEY ("opening_id") REFERENCES "public"."openings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_candidate_user_id_profiles_id_fk" FOREIGN KEY ("candidate_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_session_id_interview_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_questions" ADD CONSTRAINT "opening_questions_opening_id_openings_id_fk" FOREIGN KEY ("opening_id") REFERENCES "public"."openings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "openings" ADD CONSTRAINT "openings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "openings" ADD CONSTRAINT "openings_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_session_id_interview_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soft_skill_results" ADD CONSTRAINT "soft_skill_results_session_id_interview_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soft_skill_results" ADD CONSTRAINT "soft_skill_results_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_session_id_interview_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turns" ADD CONSTRAINT "turns_session_id_interview_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidate_cvs_user_idx" ON "candidate_cvs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "competency_results_history_idx" ON "competency_results" USING btree ("user_id","competency_key","created_at");--> statement-breakpoint
CREATE INDEX "events_start_idx" ON "events" USING btree ("session_id","start_ms");--> statement-breakpoint
CREATE INDEX "interview_sessions_user_created_idx" ON "interview_sessions" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "invitations_status_idx" ON "invitations" USING btree ("opening_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_active_email_idx" ON "invitations" USING btree ("opening_id","email") WHERE "invitations"."status" in ('pending', 'accepted', 'started');--> statement-breakpoint
CREATE INDEX "opening_questions_order_idx" ON "opening_questions" USING btree ("opening_id","order_idx");--> statement-breakpoint
CREATE INDEX "openings_org_idx" ON "openings" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "soft_skill_results_user_idx" ON "soft_skill_results" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transcript_start_idx" ON "transcript_segments" USING btree ("session_id","start_ms");--> statement-breakpoint
CREATE UNIQUE INDEX "turns_session_idx" ON "turns" USING btree ("session_id","idx");