CREATE TABLE IF NOT EXISTS "account_deletion_executions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "deletion_request_id" uuid NOT NULL REFERENCES "account_deletion_requests"("id") ON DELETE RESTRICT,
  "target_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "status" text DEFAULT 'prepared' NOT NULL,
  "plan_version" text NOT NULL,
  "plan_digest" text NOT NULL,
  "frozen_plan" jsonb NOT NULL,
  "blocker_keys" text[] DEFAULT '{}' NOT NULL,
  "prepared_by_admin_email" text NOT NULL,
  "prepared_at" timestamp with time zone DEFAULT now() NOT NULL,
  "final_authorized_by_admin_email" text,
  "final_authorized_at" timestamp with time zone,
  "failure_code" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "account_deletion_executions_status_ck"
    CHECK ("status" in ('prepared','blocked','awaiting_final_authorization','final_authorized','execution_disabled','verified'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "account_deletion_executions_request_idx"
  ON "account_deletion_executions" ("deletion_request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_deletion_executions_target_user_idx"
  ON "account_deletion_executions" ("target_user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account_deletion_execution_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "execution_id" uuid NOT NULL REFERENCES "account_deletion_executions"("id") ON DELETE RESTRICT,
  "event_type" text NOT NULL,
  "actor_admin_email" text NOT NULL,
  "details" jsonb DEFAULT '{}' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_deletion_execution_events_execution_created_idx"
  ON "account_deletion_execution_events" ("execution_id", "created_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "aced_prevent_account_deletion_execution_event_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'account_deletion_execution_events is append-only';
END;
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'account_deletion_execution_events_no_update_delete'
      AND tgrelid = 'account_deletion_execution_events'::regclass
  ) THEN
    CREATE TRIGGER "account_deletion_execution_events_no_update_delete"
      BEFORE UPDATE OR DELETE ON "account_deletion_execution_events"
      FOR EACH ROW EXECUTE FUNCTION "aced_prevent_account_deletion_execution_event_mutation"();
  END IF;
END;
$$;
