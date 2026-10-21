ALTER TABLE "question_generation_audits"
  ADD COLUMN IF NOT EXISTS "raw_model_output_preview" text,
  ADD COLUMN IF NOT EXISTS "failed_check" text;
