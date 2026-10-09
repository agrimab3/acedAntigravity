ALTER TABLE "mock_test_sessions" ADD COLUMN "current_break_after" text;--> statement-breakpoint
ALTER TABLE "mock_test_sessions" ADD COLUMN "break_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mock_test_sessions" ADD COLUMN "break_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mock_test_sessions" ADD CONSTRAINT "mock_test_sessions_break_after_ck" CHECK ("mock_test_sessions"."current_break_after" is null or "mock_test_sessions"."current_break_after" in ('english', 'math', 'reading'));