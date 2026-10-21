import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("generate-questions.mjs", "utf8");
const schema = readFileSync("db/schema.ts", "utf8");
const migration = readFileSync("drizzle/0035_content_factory_format_audit.sql", "utf8");

test("Gemini writer and both reviewer stages request schema-constrained JSON and retry one malformed response", () => {
  assert.match(source, /responseMimeType:\s*"application\/json"/);
  assert.match(source, /responseJsonSchema:\s*schema/);
  assert.equal((source.match(/parseStructuredOutputWithOneRetry\(/g) ?? []).length >= 6, true);
});

test("English writers receive the exact underline contract and one format-only repair path", () => {
  assert.match(source, /\[underline\]target text\[\/underline\]/);
  assert.match(source, /getEnglishUnderlineFormatFailure/);
  assert.match(source, /repairEnglishUnderlineFormat/);
  assert.match(source, /rejected_english_format/);
});

test("format skips retain an audit preview and exact failed check without logging raw output", () => {
  assert.match(schema, /rawModelOutputPreview: text\("raw_model_output_preview"\)/);
  assert.match(schema, /failedCheck: text\("failed_check"\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "raw_model_output_preview" text/);
  assert.match(source, /rawModelOutputPreview/);
  assert.match(source, /failedCheck/);
});
