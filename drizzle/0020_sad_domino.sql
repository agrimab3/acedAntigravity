ALTER TABLE "mock_tests" ADD COLUMN "released_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "mock_tests" SET "released_at" = "results_release_at" WHERE "status" = 'released' AND "released_at" IS NULL;
