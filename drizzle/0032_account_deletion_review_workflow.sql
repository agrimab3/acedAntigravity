ALTER TABLE "account_deletion_requests" ADD COLUMN IF NOT EXISTS "identity_verification_status" text DEFAULT 'not_started' NOT NULL;
--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD COLUMN IF NOT EXISTS "identity_verified_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD COLUMN IF NOT EXISTS "internal_note" text;
--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD COLUMN IF NOT EXISTS "last_status_updated_at" timestamp with time zone;
