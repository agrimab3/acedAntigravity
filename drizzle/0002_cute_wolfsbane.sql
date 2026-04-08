ALTER TABLE "questions" ADD COLUMN "fingerprint" text;--> statement-breakpoint
CREATE UNIQUE INDEX "questions_fingerprint_idx" ON "questions" USING btree ("fingerprint");