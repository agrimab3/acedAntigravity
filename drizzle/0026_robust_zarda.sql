CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"source" text NOT NULL,
	"context_id" text,
	"page_path" text NOT NULL,
	"rating" integer,
	"tags" text[],
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_source_ck" CHECK ("feedback"."source" in ('mock_test','practice_session','practice_test','page_footer')),
	CONSTRAINT "feedback_rating_ck" CHECK ("feedback"."rating" is null or "feedback"."rating" between 1 and 5),
	CONSTRAINT "feedback_message_length_ck" CHECK ("feedback"."message" is null or char_length("feedback"."message") <= 1000),
	CONSTRAINT "feedback_nonempty_ck" CHECK ("feedback"."rating" is not null or coalesce(array_length("feedback"."tags",1),0) > 0 or nullif(trim("feedback"."message"),'') is not null)
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_user_context_idx" ON "feedback" USING btree ("user_id","context_id") WHERE "feedback"."user_id" is not null and "feedback"."context_id" is not null;