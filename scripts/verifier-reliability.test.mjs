import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../generate-questions.mjs", import.meta.url), "utf8");
const verifierStart = source.indexOf("async function verifyGeneratedQuestionCorrectness");
const verifier = source.slice(verifierStart, source.indexOf("function hasVerifierHardFailure", verifierStart));

test("Groq strict-schema transport rejection retries once in JSON-object mode", () => {
  assert.match(source, /allowSchemaTransportFallback = true/);
  assert.match(source, /invalid json schema for response_format/);
  assert.match(source, /useJsonObjectMode: true/);
  assert.match(source, /allowSchemaTransportFallback: false/);
});

test("JSON-object Groq fallback still requires the complete verifier schema locally", () => {
  assert.match(verifier, /correctnessVerifierSchema\.parse\(parsedPayload\)/);
  assert.match(source, /note: z\.string\(\)/);
  const verifierSchema = verifier.slice(verifier.indexOf("const schema ="), verifier.indexOf("const prompt ="));
  assert.match(verifierSchema, /"note"/);
});

test("Gemini verifier routing retains configured fallback providers", () => {
  assert.match(verifier, /buildVerifierProviderOrder\(generationSourceProvider, provider\)/);
  assert.match(verifier, /fallbackProviders: verifierProviderOverride \? \[\] : verifierProviderOrder\.slice\(1\)/);
});

test("verifier failures remain terminal and never approve a draft", () => {
  assert.match(source, /finalDisposition: "rejected_verifier_error"/);
  assert.match(source, /approved: false/);
});
