CREATE TABLE "mock_test_form_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"section_key" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mock_test_form_questions_section_allowed_ck" CHECK ("mock_test_form_questions"."section_key" in ('english', 'math', 'reading', 'science')),
	CONSTRAINT "mock_test_form_questions_position_positive_ck" CHECK ("mock_test_form_questions"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "mock_test_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mock_test_id" uuid NOT NULL,
	"version" text DEFAULT 'A' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mock_test_forms_status_allowed_ck" CHECK ("mock_test_forms"."status" in ('draft', 'review', 'locked'))
);
--> statement-breakpoint
ALTER TABLE "mock_test_form_questions" ADD CONSTRAINT "mock_test_form_questions_form_id_mock_test_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."mock_test_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_test_form_questions" ADD CONSTRAINT "mock_test_form_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_test_form_questions" ADD CONSTRAINT "mock_test_form_questions_section_key_act_sections_key_fk" FOREIGN KEY ("section_key") REFERENCES "public"."act_sections"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_test_forms" ADD CONSTRAINT "mock_test_forms_mock_test_id_mock_tests_id_fk" FOREIGN KEY ("mock_test_id") REFERENCES "public"."mock_tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mock_test_form_question_once_idx" ON "mock_test_form_questions" USING btree ("question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mock_test_form_section_position_idx" ON "mock_test_form_questions" USING btree ("form_id","section_key","position");--> statement-breakpoint
CREATE INDEX "mock_test_form_questions_form_idx" ON "mock_test_form_questions" USING btree ("form_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mock_test_forms_test_version_idx" ON "mock_test_forms" USING btree ("mock_test_id","version");