CREATE TABLE "mock_waitlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mock_test_id" uuid NOT NULL,
	"email" text NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invited_at" timestamp with time zone,
	"invite_token" text,
	"invite_used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "mock_waitlist" ADD CONSTRAINT "mock_waitlist_mock_test_id_mock_tests_id_fk" FOREIGN KEY ("mock_test_id") REFERENCES "public"."mock_tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_waitlist" ADD CONSTRAINT "mock_waitlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mock_waitlist_test_email_idx" ON "mock_waitlist" USING btree ("mock_test_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "mock_waitlist_invite_token_idx" ON "mock_waitlist" USING btree ("invite_token");