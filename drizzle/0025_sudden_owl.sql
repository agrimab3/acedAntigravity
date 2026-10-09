CREATE TABLE "mock_email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mock_test_id" uuid NOT NULL,
	"registration_id" uuid,
	"source_key" text,
	"email_type" text NOT NULL,
	"unique_key" text NOT NULL,
	"recipient_email" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"subject" text NOT NULL,
	"html_body" text NOT NULL,
	"text_body" text NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"lock_token" text,
	"sent_at" timestamp with time zone,
	"provider_message_id" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mock_waitlist" ADD COLUMN "time_zone" text;--> statement-breakpoint
ALTER TABLE "mock_email_outbox" ADD CONSTRAINT "mock_email_outbox_mock_test_id_mock_tests_id_fk" FOREIGN KEY ("mock_test_id") REFERENCES "public"."mock_tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_email_outbox" ADD CONSTRAINT "mock_email_outbox_registration_id_mock_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."mock_registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mock_email_outbox_unique_key_idx" ON "mock_email_outbox" USING btree ("unique_key");--> statement-breakpoint
CREATE INDEX "mock_email_outbox_due_idx" ON "mock_email_outbox" USING btree ("sent_at","scheduled_at");--> statement-breakpoint
CREATE INDEX "mock_email_outbox_registration_idx" ON "mock_email_outbox" USING btree ("registration_id");