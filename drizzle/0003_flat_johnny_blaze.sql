ALTER TABLE "questions" ADD COLUMN "generation_model" text;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "review_notes" text;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "reviewed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;