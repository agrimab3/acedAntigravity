import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../generate-questions.mjs", import.meta.url), "utf8");
const pipelineStart = source.indexOf("async function runReviewPipelineForQuestion");
const pipelineEnd = source.indexOf("async function insertQuestions", pipelineStart);
const pipeline = source.slice(pipelineStart, pipelineEnd);
const primaryStart = pipeline.indexOf("const reviewOperation = await reviewGeneratedQuestion");
const verifierStart = pipeline.indexOf("const verificationOperation = await verifyGeneratedQuestionCorrectness");
const primaryStage = pipeline.slice(primaryStart, verifierStart);
const verifierStage = pipeline.slice(verifierStart, pipeline.indexOf("if (hasVerifierHardFailure", verifierStart));

function providerStoppedBranch(stage) {
  const start = stage.indexOf("if (error instanceof ProviderRunStoppedError)");
  const end = stage.indexOf("}\n\n    if (comparisonMode)", start);
  return stage.slice(start, end === -1 ? undefined : end);
}

test("primary-review provider failure is terminalized before the run is stopped", () => {
  const stopped = providerStoppedBranch(primaryStage);
  assert.match(stopped, /finalDisposition: "rejected_reviewer_error"/);
  assert.ok(stopped.indexOf('finalDisposition: "rejected_reviewer_error"') < stopped.indexOf("throw error"));
});

test("primary-review keep plus verifier failure reaches an explicit non-approved terminal state", () => {
  const stopped = providerStoppedBranch(verifierStage);
  assert.match(stopped, /primaryReviewerResult: reviewerResult/);
  assert.match(stopped, /finalDisposition: "rejected_verifier_error"/);
  assert.match(stopped, /counters\.skipped \+= 1/);
  assert.ok(stopped.indexOf('finalDisposition: "rejected_verifier_error"') < stopped.indexOf("throw error"));
});

test("primary-review keep plus verifier schema error reaches an explicit terminal state", () => {
  assert.match(verifierStage, /parserSchemaErrors: \[error instanceof Error \? error\.message : "unknown verifier error"\]/);
  assert.match(verifierStage, /finalDisposition: "rejected_verifier_error"/);
});

test("primary-review keep plus exhausted verifier retries reaches an explicit terminal state", () => {
  const stopped = providerStoppedBranch(verifierStage);
  assert.match(stopped, /parserSchemaErrors: \[message\]/);
  assert.match(stopped, /finalReason: message/);
});

test("successful verifier completion still follows the normal approval path", () => {
  assert.match(pipeline, /verifierResult = verificationOperation\.verifierResult/);
  assert.match(pipeline, /return \{\n    approved: true,/);
  assert.match(source, /finalDisposition: "stored_draft"/);
});

test("no handled review or verifier error leaves an audit record pending", () => {
  assert.doesNotMatch(primaryStage, /finalDisposition:\s*"pending"/);
  assert.doesNotMatch(verifierStage, /finalDisposition:\s*"pending"/);
  assert.match(primaryStage, /finalDisposition: "rejected_reviewer_error"/);
  assert.match(verifierStage, /finalDisposition: "rejected_verifier_error"/);
});

test("shared-set callers preserve a review-stage terminal disposition instead of overwriting it", () => {
  assert.match(source, /if \(!error\.auditTerminalized\) \{/);
  assert.match(source, /error\.auditTerminalized = true/);
});
