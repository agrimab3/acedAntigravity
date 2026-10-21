import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../generate-questions.mjs", import.meta.url), "utf8");
const verifierStart = source.indexOf("async function verifyGeneratedQuestionCorrectness");
const verifier = source.slice(verifierStart, source.indexOf("function hasVerifierHardFailure", verifierStart));
const blindPromptStart = source.indexOf("function buildBlindCorrectnessVerificationPrompt");
const blindPrompt = source.slice(blindPromptStart, source.indexOf("async function fetchProviderResponse", blindPromptStart));

test("Groq strict-schema transport rejection retries once in JSON-object mode", () => {
  assert.match(source, /allowSchemaTransportFallback = true/);
  assert.match(source, /invalid json schema for response_format/);
  assert.match(source, /useJsonObjectMode: true/);
  assert.match(source, /allowSchemaTransportFallback: false/);
});

test("blind verifier requires only a chosen answer and concise reason locally", () => {
  assert.match(verifier, /parseStructuredOutputWithOneRetry/);
  assert.match(verifier, /correctnessVerifierSchema\.parse\(parseModelJson\(text\)\)/);
  assert.match(source, /chosen_answer: z\.enum\(ANSWER_CHOICES\)/);
  assert.match(source, /reason: z\.string\(\)\.min\(1\)\.max\(500\)/);
  const verifierSchema = verifier.slice(verifier.indexOf("const schema ="), verifier.indexOf("const prompt ="));
  assert.match(verifierSchema, /chosen_answer:/);
  assert.match(verifierSchema, /reason:/);
});

test("blind verifier never receives the answer key or explanation", () => {
  assert.match(blindPrompt, /answer key and explanation are intentionally withheld/i);
  const itemPayload = blindPrompt.slice(blindPrompt.indexOf("Item:"));
  assert.doesNotMatch(itemPayload, /correct_answer/);
  assert.doesNotMatch(itemPayload, /explanation/);
});

test("every generated and reviewed section, including Math, is constrained to four A–D choices", () => {
  assert.match(source, /This four-choice A–D format applies to every section, including Math\./);
  assert.match(source, /Every section, including Math, uses exactly four answer choices: A, B, C, D\./);
  assert.match(source, /choices must be an object with exactly four keys: A, B, C, D/);
  assert.match(source, /D: z\.string\(\)\.min\(1\),\n  \}\)\.strict\(\)/);
});

test("key disagreement has an explicit rejecting disposition", () => {
  assert.match(source, /verifierResult\.chosen_answer !== normalizedQuestion\.correctAnswer/);
  assert.match(source, /disposition: "key_mismatch"/);
  assert.match(source, /counters\.reviewRejected \+= 1/);
});

test("Gemini verifier routing retains configured fallback providers", () => {
  assert.match(verifier, /buildVerifierProviderOrder\(generationSourceProvider, provider\)/);
  assert.match(verifier, /fallbackProviders: verifierProviderOverride \? \[\] : verifierProviderOrder\.slice\(1\)/);
});

test("verifier failures remain terminal and never approve a draft", () => {
  assert.match(source, /finalDisposition: "rejected_verifier_error"/);
  assert.match(source, /approved: false/);
});
