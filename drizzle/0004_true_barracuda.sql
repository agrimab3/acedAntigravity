CREATE TABLE "practice_test_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"section_run_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid,
	"question_order" integer NOT NULL,
	"topic_name" text NOT NULL,
	"selected_answer" text,
	"correct_answer" text NOT NULL,
	"is_correct" boolean,
	"flagged" boolean DEFAULT false NOT NULL,
	"time_spent_seconds" integer DEFAULT 0 NOT NULL,
	"question_snapshot" jsonb NOT NULL,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_test_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"section_key" text NOT NULL,
	"section_order" integer NOT NULL,
	"title" text NOT NULL,
	"question_count" integer DEFAULT 0 NOT NULL,
	"answered_count" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"accuracy_pct" integer DEFAULT 0 NOT NULL,
	"estimated_score" integer,
	"time_limit_seconds" integer DEFAULT 0 NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_test_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"mode_key" text NOT NULL,
	"format" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"science_included" boolean DEFAULT false NOT NULL,
	"total_question_count" integer DEFAULT 0 NOT NULL,
	"answered_count" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"accuracy_pct" integer DEFAULT 0 NOT NULL,
	"composite_estimated_score" integer,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "practice_test_answers" ADD CONSTRAINT "practice_test_answers_session_id_practice_test_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."practice_test_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_test_answers" ADD CONSTRAINT "practice_test_answers_section_run_id_practice_test_sections_id_fk" FOREIGN KEY ("section_run_id") REFERENCES "public"."practice_test_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_test_answers" ADD CONSTRAINT "practice_test_answers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_test_answers" ADD CONSTRAINT "practice_test_answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_test_sections" ADD CONSTRAINT "practice_test_sections_session_id_practice_test_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."practice_test_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_test_sections" ADD CONSTRAINT "practice_test_sections_section_key_act_sections_key_fk" FOREIGN KEY ("section_key") REFERENCES "public"."act_sections"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_test_sessions" ADD CONSTRAINT "practice_test_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "practice_test_answers_section_question_order_idx" ON "practice_test_answers" USING btree ("section_run_id","question_order");--> statement-breakpoint
CREATE UNIQUE INDEX "practice_test_sections_session_order_idx" ON "practice_test_sections" USING btree ("session_id","section_order");