ALTER TABLE "mock_test_answers" ADD COLUMN "client_sequence" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mock_test_answers" ADD COLUMN "picked_at_server" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mock_test_answers" ADD COLUMN "synced_late" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mock_test_section_runs" ADD COLUMN "outbox_cleared_at" timestamp with time zone;