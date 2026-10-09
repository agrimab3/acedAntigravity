CREATE TABLE "mock_stripe_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"registration_id" uuid,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mock_registrations" ADD COLUMN "stripe_refund_id" text;--> statement-breakpoint
ALTER TABLE "mock_registrations" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mock_registrations" ADD COLUMN "refund_reason" text;--> statement-breakpoint
ALTER TABLE "mock_stripe_events" ADD CONSTRAINT "mock_stripe_events_registration_id_mock_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."mock_registrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mock_stripe_events_registration_idx" ON "mock_stripe_events" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "mock_stripe_events_type_idx" ON "mock_stripe_events" USING btree ("event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "mock_registrations_payment_intent_idx" ON "mock_registrations" USING btree ("stripe_payment_intent_id");