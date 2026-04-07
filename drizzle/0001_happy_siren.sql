CREATE TABLE "ai_tutor_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"system_prompt" text NOT NULL,
	"hint_policy" text,
	"review_policy" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_exposures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"times_seen" integer DEFAULT 0 NOT NULL,
	"times_correct" integer DEFAULT 0 NOT NULL,
	"times_incorrect" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_answered_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_skill_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"current_difficulty" text DEFAULT 'easy' NOT NULL,
	"recommended_difficulty" text DEFAULT 'easy' NOT NULL,
	"recent_accuracy_pct" integer DEFAULT 0 NOT NULL,
	"rolling_accuracy_pct" integer DEFAULT 0 NOT NULL,
	"average_time_spent_seconds" integer DEFAULT 0 NOT NULL,
	"total_answered" integer DEFAULT 0 NOT NULL,
	"total_correct" integer DEFAULT 0 NOT NULL,
	"hints_used" integer DEFAULT 0 NOT NULL,
	"correct_streak" integer DEFAULT 0 NOT NULL,
	"incorrect_streak" integer DEFAULT 0 NOT NULL,
	"last_answered_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "question_exposures" ADD CONSTRAINT "question_exposures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_exposures" ADD CONSTRAINT "question_exposures_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_skill_state" ADD CONSTRAINT "topic_skill_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_skill_state" ADD CONSTRAINT "topic_skill_state_topic_id_act_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."act_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_tutor_profiles_slug_idx" ON "ai_tutor_profiles" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "question_exposures_user_question_idx" ON "question_exposures" USING btree ("user_id","question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "topic_skill_state_user_topic_idx" ON "topic_skill_state" USING btree ("user_id","topic_id");