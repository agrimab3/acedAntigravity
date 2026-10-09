CREATE TABLE "mock_test_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"section_run_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"question_order" integer NOT NULL,
	"selected_answer" text,
	"flagged" boolean DEFAULT false NOT NULL,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mock_test_answers_selected_answer_ck" CHECK ("mock_test_answers"."selected_answer" is null or "mock_test_answers"."selected_answer" in ('A', 'B', 'C', 'D')),
	CONSTRAINT "mock_test_answers_question_order_positive_ck" CHECK ("mock_test_answers"."question_order" > 0)
);
--> statement-breakpoint
CREATE TABLE "mock_test_section_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"section_key" text NOT NULL,
	"section_order" integer NOT NULL,
	"time_limit_seconds" integer NOT NULL,
	"started_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mock_test_section_runs_order_ck" CHECK ("mock_test_section_runs"."section_order" between 0 and 3),
	CONSTRAINT "mock_test_section_runs_limit_positive_ck" CHECK ("mock_test_section_runs"."time_limit_seconds" > 0)
);
--> statement-breakpoint
CREATE TABLE "mock_test_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"current_section_order" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mock_test_sessions_status_allowed_ck" CHECK ("mock_test_sessions"."status" in ('in_progress', 'completed')),
	CONSTRAINT "mock_test_sessions_section_order_ck" CHECK ("mock_test_sessions"."current_section_order" between 0 and 3)
);
--> statement-breakpoint
ALTER TABLE "mock_test_answers" ADD CONSTRAINT "mock_test_answers_session_id_mock_test_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."mock_test_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_test_answers" ADD CONSTRAINT "mock_test_answers_section_run_id_mock_test_section_runs_id_fk" FOREIGN KEY ("section_run_id") REFERENCES "public"."mock_test_section_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_test_answers" ADD CONSTRAINT "mock_test_answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_test_section_runs" ADD CONSTRAINT "mock_test_section_runs_session_id_mock_test_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."mock_test_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_test_section_runs" ADD CONSTRAINT "mock_test_section_runs_section_key_act_sections_key_fk" FOREIGN KEY ("section_key") REFERENCES "public"."act_sections"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_test_sessions" ADD CONSTRAINT "mock_test_sessions_registration_id_mock_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."mock_registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_test_sessions" ADD CONSTRAINT "mock_test_sessions_form_id_mock_test_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."mock_test_forms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mock_test_answers_session_question_idx" ON "mock_test_answers" USING btree ("session_id","question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mock_test_answers_section_order_idx" ON "mock_test_answers" USING btree ("section_run_id","question_order");--> statement-breakpoint
CREATE UNIQUE INDEX "mock_test_section_runs_session_order_idx" ON "mock_test_section_runs" USING btree ("session_id","section_order");--> statement-breakpoint
CREATE UNIQUE INDEX "mock_test_sessions_registration_idx" ON "mock_test_sessions" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "mock_test_sessions_form_idx" ON "mock_test_sessions" USING btree ("form_id");