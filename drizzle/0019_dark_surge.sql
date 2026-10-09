CREATE TABLE "mock_test_client_presence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mock_test_ops_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mock_test_id" uuid NOT NULL,
	"registration_id" uuid,
	"session_id" uuid,
	"section_key" text,
	"kind" text NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mock_test_client_presence" ADD CONSTRAINT "mock_test_client_presence_registration_id_mock_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."mock_registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_test_client_presence" ADD CONSTRAINT "mock_test_client_presence_session_id_mock_test_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."mock_test_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_test_ops_events" ADD CONSTRAINT "mock_test_ops_events_mock_test_id_mock_tests_id_fk" FOREIGN KEY ("mock_test_id") REFERENCES "public"."mock_tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_test_ops_events" ADD CONSTRAINT "mock_test_ops_events_registration_id_mock_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."mock_registrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_test_ops_events" ADD CONSTRAINT "mock_test_ops_events_session_id_mock_test_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."mock_test_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mock_test_client_presence_registration_client_idx" ON "mock_test_client_presence" USING btree ("registration_id","client_id");--> statement-breakpoint
CREATE INDEX "mock_test_client_presence_last_seen_idx" ON "mock_test_client_presence" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "mock_test_client_presence_registration_idx" ON "mock_test_client_presence" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "mock_test_ops_events_test_created_idx" ON "mock_test_ops_events" USING btree ("mock_test_id","created_at");--> statement-breakpoint
CREATE INDEX "mock_test_ops_events_registration_idx" ON "mock_test_ops_events" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "mock_test_ops_events_kind_idx" ON "mock_test_ops_events" USING btree ("kind");