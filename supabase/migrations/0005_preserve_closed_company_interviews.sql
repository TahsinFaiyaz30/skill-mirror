ALTER TABLE "interview_sessions" ADD COLUMN "organization_removed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_scope_check" CHECK (
      ("interview_sessions"."kind" = 'practice' AND "interview_sessions"."length_minutes" IN (10,20)
        AND "interview_sessions"."org_id" IS NULL AND "interview_sessions"."opening_id" IS NULL AND NOT "interview_sessions"."organization_removed")
      OR ("interview_sessions"."kind" IN ('company','preview') AND "interview_sessions"."length_minutes" IN (15,20,30,45)
        AND (
          (NOT "interview_sessions"."organization_removed" AND "interview_sessions"."org_id" IS NOT NULL AND "interview_sessions"."opening_id" IS NOT NULL)
          OR ("interview_sessions"."organization_removed" AND "interview_sessions"."org_id" IS NULL AND "interview_sessions"."opening_id" IS NULL AND "interview_sessions"."invitation_id" IS NULL)
        ))
    );
--> statement-breakpoint
ALTER TABLE "interview_sessions" DROP CONSTRAINT "interview_sessions_check";
