import test from "node:test";
import assert from "node:assert/strict";
import { parseStructuredOutputWithOneRetry, StructuredOutputError } from "../lib/content-factory-structured-output.mjs";

test("structured output retries one malformed response before accepting valid JSON", async () => {
  let calls = 0;
  const result = await parseStructuredOutputWithOneRetry({
    request: async () => {
      calls += 1;
      return calls === 1 ? "not json" : '{"answer":"A"}';
    },
    parse: JSON.parse,
  });
  assert.equal(calls, 2);
  assert.deepEqual(result.value, { answer: "A" });
});

test("structured output records only a bounded raw preview after the single retry", async () => {
  const raw = "x".repeat(400);
  await assert.rejects(
    parseStructuredOutputWithOneRetry({ request: async () => raw, parse: JSON.parse, label: "Writer" }),
    (error) => {
      assert.ok(error instanceof StructuredOutputError);
      assert.equal(error.rawOutputPreview.length, 300);
      assert.match(error.failedCheck, /Unexpected token/);
      return true;
    }
  );
});
