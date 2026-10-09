CREATE TABLE "mock_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mock_test_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"time_zone" text NOT NULL,
	"agreed_no_refund_at" timestamp with time zone NOT NULL,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"paid_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"english_score" integer,
	"math_score" integer,
	"reading_score" integer,
	"science_score" integer,
	"composite" integer,
	"percentile" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mock_registrations_time_zone_allowed_ck" CHECK ("mock_registrations"."time_zone" in (
        'America/Los_Angeles',
        'America/Denver',
        'America/Chicago',
        'America/New_York',
        'America/Anchorage',
        'Pacific/Honolulu'
      ))
);
--> statement-breakpoint
CREATE TABLE "mock_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"test_date" date NOT NULL,
	"act_date" date NOT NULL,
	"start_cutoff" time DEFAULT '21:00:00' NOT NULL,
	"results_release_at" timestamp with time zone NOT NULL,
	"price_cents" integer DEFAULT 200 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mock_tests_status_allowed_ck" CHECK ("mock_tests"."status" in ('draft', 'open', 'released'))
);
--> statement-breakpoint
ALTER TABLE "mock_registrations" ADD CONSTRAINT "mock_registrations_mock_test_id_mock_tests_id_fk" FOREIGN KEY ("mock_test_id") REFERENCES "public"."mock_tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_registrations" ADD CONSTRAINT "mock_registrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mock_registrations_test_user_idx" ON "mock_registrations" USING btree ("mock_test_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mock_registrations_checkout_session_idx" ON "mock_registrations" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mock_tests_slug_idx" ON "mock_tests" USING btree ("slug");--> statement-breakpoint
INSERT INTO "mock_tests" (
  "slug",
  "test_date",
  "act_date",
  "start_cutoff",
  "results_release_at",
  "price_cents",
  "status"
)
VALUES (
  '2026-12-05',
  '2026-12-05',
  '2026-12-12',
  '21:00:00',
  '2026-12-06T22:00:00Z',
  200,
  'open'
)
ON CONFLICT ("slug") DO UPDATE
SET "test_date" = EXCLUDED."test_date",
    "act_date" = EXCLUDED."act_date",
    "start_cutoff" = EXCLUDED."start_cutoff",
    "results_release_at" = EXCLUDED."results_release_at",
    "price_cents" = EXCLUDED."price_cents",
    "status" = EXCLUDED."status";
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_paid_mock_registration_timezone_change()
RETURNS trigger AS $$
BEGIN
  IF OLD."paid_at" IS NOT NULL
     AND NEW."time_zone" IS DISTINCT FROM OLD."time_zone" THEN
    RAISE EXCEPTION 'time_zone cannot be changed after a mock registration is paid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "mock_registrations_lock_paid_timezone"
BEFORE UPDATE OF "time_zone" ON "mock_registrations"
FOR EACH ROW
EXECUTE FUNCTION prevent_paid_mock_registration_timezone_change();
