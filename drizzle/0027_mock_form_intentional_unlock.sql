CREATE OR REPLACE FUNCTION protect_locked_mock_test_form()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'locked' THEN
    IF TG_OP = 'DELETE' OR NEW.status <> 'review' OR NEW.locked_at IS NOT NULL OR NEW.locked_by_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'Locked mock test forms are immutable except for an intentional unlock to review.';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS tutor_model_usage (
 id bigserial PRIMARY KEY,
 provider text NOT NULL,
 model text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tutor_model_usage_created_at_idx ON tutor_model_usage (created_at);
