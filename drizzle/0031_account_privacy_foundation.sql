ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "agreed_terms_version" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "age_confirmed_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account_deletion_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "status" text DEFAULT 'requested' NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reviewed_at" timestamp with time zone,
  "completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_deletion_requests_user_requested_idx" ON "account_deletion_requests" ("user_id", "requested_at");
