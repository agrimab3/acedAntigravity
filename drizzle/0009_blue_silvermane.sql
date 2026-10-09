ALTER TABLE "mock_registrations" ADD COLUMN "hold_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mock_tests" ADD COLUMN "seat_limit" integer DEFAULT 100 NOT NULL;
--> statement-breakpoint
UPDATE "mock_tests" SET "seat_limit" = 100 WHERE "slug" = '2026-12-05';
