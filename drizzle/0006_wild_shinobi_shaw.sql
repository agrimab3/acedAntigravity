CREATE TABLE "question_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_key" text NOT NULL,
	"topic_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text,
	"content" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_sets_section_allowed_ck" CHECK ("question_sets"."section_key" in ('reading', 'science')),
	CONSTRAINT "question_sets_kind_allowed_ck" CHECK ("question_sets"."kind" in ('reading_passage', 'science_stimulus'))
);
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "question_set_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "walkthrough_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "question_sets" ADD CONSTRAINT "question_sets_section_key_act_sections_key_fk" FOREIGN KEY ("section_key") REFERENCES "public"."act_sections"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_sets" ADD CONSTRAINT "question_sets_topic_id_act_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."act_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_sets_section_idx" ON "question_sets" USING btree ("section_key");--> statement-breakpoint
CREATE INDEX "question_sets_topic_idx" ON "question_sets" USING btree ("topic_id");--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_question_set_id_question_sets_id_fk" FOREIGN KEY ("question_set_id") REFERENCES "public"."question_sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "questions_question_set_idx" ON "questions" USING btree ("question_set_id");
