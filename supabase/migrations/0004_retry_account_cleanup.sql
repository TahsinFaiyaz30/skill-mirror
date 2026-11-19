CREATE TABLE "pending_account_deletions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pending_account_deletions" ENABLE ROW LEVEL SECURITY;