ALTER TABLE "users" ADD COLUMN "preferred_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "act_test_date" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "previous_act_score" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "has_recommendations" boolean;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" timestamp with time zone;