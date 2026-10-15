import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("interactive tutor has no Gemini transport or Gemini fallback", () => {
  const tutorAi = readFileSync("lib/tutor-ai.ts", "utf8");
  const fallback = readFileSync("lib/tutor-fallback-chain.mjs", "utf8");

  assert.doesNotMatch(tutorAi, /generateGeminiText|hasGeminiApiKey|gemini:/);
  assert.doesNotMatch(fallback, /gemini|TUTOR_GEMINI_MODELS/);
  assert.match(tutorAi, /GROQ_API_KEY/);
  assert.match(fallback, /provider:'groq'/);
});

test("Gemini content factory remains isolated from tutor routing", () => {
  const factory = readFileSync("scripts/content-nightly.mjs", "utf8");

  assert.match(factory, /QUESTION_GENERATION_PROVIDER:'gemini'/);
  assert.match(factory, /QUESTION_REVIEW_PROVIDER:'gemini'/);
  assert.match(factory, /GROQ_API_KEY:''/);
});

test("tutor logs do not include student, session, question, prompt, or reply fields", () => {
  const route = readFileSync("app/api/tutor/route.ts", "utf8");
  const logBlocks = route.match(/console\.error\([^;]+\);/gs) ?? [];
  const tutorLogs = logBlocks.filter((block) => block.includes("tutor-guard") || block.includes("Tutor request failed"));

  assert.ok(tutorLogs.length >= 4);
  for (const log of tutorLogs) {
    assert.doesNotMatch(log, /userId|sessionId|questionId|message\s*:|prompt\s*:|normalizedReply|error\s*:/);
  }
});
