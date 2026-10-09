CREATE TABLE "mock_test_topic_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"section_key" text NOT NULL,
	"topic_id" uuid NOT NULL,
	"topic_name" text NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mock_test_topic_results_counts_ck" CHECK ("mock_test_topic_results"."correct_count" >= 0 and "mock_test_topic_results"."total_count" >= "mock_test_topic_results"."correct_count")
);
--> statement-breakpoint
ALTER TABLE "mock_test_form_questions" ADD COLUMN "correct_answer_snapshot" text;--> statement-breakpoint
ALTER TABLE "mock_test_form_questions" ADD COLUMN "topic_id_snapshot" uuid;--> statement-breakpoint
ALTER TABLE "mock_test_form_questions" ADD COLUMN "topic_name_snapshot" text;--> statement-breakpoint
ALTER TABLE "mock_tests" ADD COLUMN "composite_distribution" jsonb;--> statement-breakpoint
ALTER TABLE "mock_test_form_questions" DISABLE TRIGGER "protect_locked_mock_test_form_questions_trigger";--> statement-breakpoint
UPDATE "mock_test_form_questions" mfq
SET
  "correct_answer_snapshot" = q."correct_answer",
  "topic_id_snapshot" = q."topic_id",
  "topic_name_snapshot" = t."name"
FROM "questions" q
INNER JOIN "act_topics" t ON t."id" = q."topic_id"
WHERE mfq."question_id" = q."id";--> statement-breakpoint
ALTER TABLE "mock_test_form_questions" ENABLE TRIGGER "protect_locked_mock_test_form_questions_trigger";--> statement-breakpoint
ALTER TABLE "mock_test_form_questions" ALTER COLUMN "correct_answer_snapshot" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mock_test_form_questions" ALTER COLUMN "topic_id_snapshot" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mock_test_form_questions" ALTER COLUMN "topic_name_snapshot" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mock_test_form_questions"
  ADD CONSTRAINT "mock_test_form_questions_answer_snapshot_ck"
  CHECK ("correct_answer_snapshot" in ('A', 'B', 'C', 'D'));--> statement-breakpoint
ALTER TABLE "mock_test_topic_results" ADD CONSTRAINT "mock_test_topic_results_registration_id_mock_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."mock_registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_test_topic_results" ADD CONSTRAINT "mock_test_topic_results_section_key_act_sections_key_fk" FOREIGN KEY ("section_key") REFERENCES "public"."act_sections"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mock_test_topic_results_registration_topic_idx" ON "mock_test_topic_results" USING btree ("registration_id","topic_id");--> statement-breakpoint
CREATE INDEX "mock_test_topic_results_registration_idx" ON "mock_test_topic_results" USING btree ("registration_id");