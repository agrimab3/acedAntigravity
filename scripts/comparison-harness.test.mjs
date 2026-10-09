import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../generate-questions.mjs", import.meta.url), "utf8");
const primaryStart = source.indexOf("const reviewOperation = await reviewGeneratedQuestion");
const verifierStart = source.indexOf("const verificationOperation = await verifyGeneratedQuestionCorrectness");
const primaryCatch = source.slice(primaryStart, verifierStart);
const verifierCatch = source.slice(verifierStart, source.indexOf("if (hasVerifierHardFailure", verifierStart));

test("primary-review failures remain primary-review failures", () => {
  assert.doesNotMatch(primaryCatch, /unverifiedForComparison|unverified_comparison/);
  assert.match(primaryCatch, /rejected_reviewer_error/);
});

test("only verifier failures gain opt-in unverified comparison handling", () => {
  assert.match(verifierCatch, /if \(comparisonMode\)/);
  assert.match(verifierCatch, /unverified_comparison/);
  assert.match(verifierCatch, /Verifier unavailable in opt-in comparison mode/);
});

test("unverified comparison candidates cannot be production approved", () => {
  assert.match(verifierCatch, /approved: false/);
  assert.match(verifierCatch, /unverifiedForComparison: true/);
});

test("comparison mode is explicit opt-in", () => {
  assert.match(source, /args\["comparison-mode"\] === "true"/);
});
