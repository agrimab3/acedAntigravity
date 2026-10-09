CREATE TABLE "question_generation_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"section_key" text NOT NULL,
	"topic_id" uuid,
	"topic_name" text NOT NULL,
	"requested_difficulty" text NOT NULL,
	"generated_difficulty" text,
	"passage" text,
	"prompt" text,
	"choices" jsonb,
	"correct_answer" text,
	"explanation" text,
	"generation_provider" text,
	"generation_model" text,
	"generation_attempt" integer DEFAULT 1 NOT NULL,
	"deterministic_findings" jsonb,
	"blocking_flags" jsonb,
	"warning_flags" jsonb,
	"primary_reviewer_result" jsonb,
	"verifier_result" jsonb,
	"provider_attempts" jsonb,
	"parser_schema_errors" jsonb,
	"final_disposition" text NOT NULL,
	"final_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "question_generation_audits" ADD CONSTRAINT "question_generation_audits_topic_id_act_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."act_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_generation_audits_run_idx" ON "question_generation_audits" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "question_generation_audits_candidate_idx" ON "question_generation_audits" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "question_generation_audits_topic_idx" ON "question_generation_audits" USING btree ("topic_id");