ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "agreed_terms_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_opt_in" boolean DEFAULT false NOT NULL;
