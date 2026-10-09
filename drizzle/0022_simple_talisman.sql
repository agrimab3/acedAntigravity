CREATE TABLE "practice_tutor_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"hint_level" integer DEFAULT 0 NOT NULL,
	"hint_count" integer DEFAULT 0 NOT NULL,
	"answer_revealed" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "practice_tutor_states" ADD CONSTRAINT "practice_tutor_states_session_id_practice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."practice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_tutor_states" ADD CONSTRAINT "practice_tutor_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_tutor_states" ADD CONSTRAINT "practice_tutor_states_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "practice_tutor_states_user_session_question_idx" ON "practice_tutor_states" USING btree ("user_id","session_id","question_id");