ALTER TABLE "questions" ADD COLUMN "usage_scope" text DEFAULT 'practice' NOT NULL;--> statement-breakpoint
CREATE INDEX "questions_usage_scope_idx" ON "questions" USING btree ("usage_scope");--> statement-breakpoint
CREATE INDEX "questions_scope_status_section_idx" ON "questions" USING btree ("usage_scope","status","section_key");--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_usage_scope_allowed_ck" CHECK ("questions"."usage_scope" in ('practice', 'mock_reserve', 'retired'));