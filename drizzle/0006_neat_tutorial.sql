ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "walkthrough_completed_at" timestamp with time zone;
