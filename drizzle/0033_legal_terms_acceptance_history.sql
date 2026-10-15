CREATE TABLE IF NOT EXISTS "legal_terms_acceptance_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "terms_version" text NOT NULL,
  "accepted_at" timestamp with time zone,
  "evidence_source" text NOT NULL,
  "migrated_at" timestamp with time zone,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "legal_terms_acceptance_history_source_ck"
    CHECK ("evidence_source" in ('affirmative', 'legacy_migrated')),
  CONSTRAINT "legal_terms_acceptance_history_affirmative_timestamp_ck"
    CHECK ("evidence_source" <> 'affirmative' OR "accepted_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "legal_terms_acceptance_history_user_version_idx"
  ON "legal_terms_acceptance_history" ("user_id", "terms_version");
--> statement-breakpoint
INSERT INTO "legal_terms_acceptance_history" (
  "user_id", "terms_version", "accepted_at", "evidence_source", "migrated_at"
)
SELECT
  "id", "agreed_terms_version", "agreed_terms_at", 'legacy_migrated', now()
FROM "users"
WHERE "agreed_terms_version" IS NOT NULL
ON CONFLICT ("user_id", "terms_version") DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "aced_prevent_legal_terms_acceptance_history_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'legal_terms_acceptance_history is append-only';
END;
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'legal_terms_acceptance_history_no_update_delete'
      AND tgrelid = 'legal_terms_acceptance_history'::regclass
  ) THEN
    CREATE TRIGGER "legal_terms_acceptance_history_no_update_delete"
      BEFORE UPDATE OR DELETE ON "legal_terms_acceptance_history"
      FOR EACH ROW EXECUTE FUNCTION "aced_prevent_legal_terms_acceptance_history_mutation"();
  END IF;
END;
$$;
