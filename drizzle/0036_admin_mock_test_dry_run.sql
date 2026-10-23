-- An explicit, non-chargeable owner rehearsal registration. It is never a seat.
ALTER TABLE "mock_registrations"
  ADD COLUMN IF NOT EXISTS "is_admin_dry_run" boolean DEFAULT false NOT NULL;

CREATE INDEX IF NOT EXISTS "mock_registrations_admin_dry_run_idx"
  ON "mock_registrations" ("mock_test_id")
  WHERE "is_admin_dry_run" = true;
