CREATE TABLE IF NOT EXISTS "public"."docs_config" (
  "id" text PRIMARY KEY NOT NULL DEFAULT 'primary',
  "visibility_mode" text NOT NULL DEFAULT 'on',
  "schedule_start" timestamp with time zone NOT NULL DEFAULT '2026-06-10T00:00:00Z',
  "schedule_end" timestamp with time zone NOT NULL DEFAULT '2026-06-14T23:59:59Z',
  "duration_started_at" timestamp with time zone,
  "duration_hours" integer,
  "published_version" integer NOT NULL DEFAULT 1,
  "draft" jsonb NOT NULL,
  "published" jsonb NOT NULL,
  "updated_by" uuid REFERENCES "public"."profiles"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "published_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "docs_config_visibility_mode_check" CHECK ("visibility_mode" IN ('off', 'on', 'scheduled', 'duration')),
  CONSTRAINT "docs_config_duration_hours_check" CHECK ("duration_hours" IS NULL OR ("duration_hours" >= 1 AND "duration_hours" <= 8760))
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "public"."docs_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "version" integer NOT NULL UNIQUE,
  "summary" text NOT NULL DEFAULT '',
  "snapshot" jsonb NOT NULL,
  "published_by" uuid REFERENCES "public"."profiles"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
ALTER TABLE "public"."docs_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."docs_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "public"."docs_config" FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "public"."docs_revisions" FROM PUBLIC, anon, authenticated;
