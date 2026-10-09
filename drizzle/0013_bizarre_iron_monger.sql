ALTER TABLE "mock_test_forms" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mock_test_forms" ADD COLUMN "locked_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "mock_test_forms" ADD CONSTRAINT "mock_test_forms_locked_by_user_id_users_id_fk" FOREIGN KEY ("locked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_locked_mock_test_form()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'locked' THEN
    RAISE EXCEPTION 'Locked mock test forms are immutable.';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER protect_locked_mock_test_form_trigger
BEFORE UPDATE OR DELETE ON "mock_test_forms"
FOR EACH ROW
EXECUTE FUNCTION protect_locked_mock_test_form();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_locked_mock_test_form_questions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_form_id uuid;
  old_form_id uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_form_id := OLD.form_id;
    IF EXISTS (
      SELECT 1 FROM mock_test_forms
      WHERE id = old_form_id AND status = 'locked'
    ) THEN
      RAISE EXCEPTION 'Questions on a locked mock test form are immutable.';
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    target_form_id := NEW.form_id;
    IF EXISTS (
      SELECT 1 FROM mock_test_forms
      WHERE id = target_form_id AND status = 'locked'
    ) THEN
      RAISE EXCEPTION 'Questions cannot be added to or moved onto a locked mock test form.';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER protect_locked_mock_test_form_questions_trigger
BEFORE INSERT OR UPDATE OR DELETE ON "mock_test_form_questions"
FOR EACH ROW
EXECUTE FUNCTION protect_locked_mock_test_form_questions();
