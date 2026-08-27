import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMissingDifficultySequence,
  buildPromptDifficultyBlueprint,
  planQuestionSetDifficultyCounts,
} from "../lib/content-generation-planning.ts";

test("requested easy medium hard blueprint remains explicit", () => {
  assert.deepEqual(
    buildPromptDifficultyBlueprint({
      easy: 1,
      medium: 1,
      hard: 1,
    }),
    ["easy", "medium", "hard"]
  );
});

test("question set planning preserves requested difficulty counts", () => {
  const plans = planQuestionSetDifficultyCounts("science", {
    easy: 1,
    medium: 1,
    hard: 1,
  });

  assert.equal(plans.length, 1);
  assert.deepEqual(plans[0], {
    easy: 1,
    medium: 1,
    hard: 1,
  });
});

test("missing child replacement targets the missing requested difficulty", () => {
  assert.deepEqual(
    buildMissingDifficultySequence(
      {
        easy: 1,
        medium: 1,
        hard: 1,
      },
      ["easy", "hard"]
    ),
    ["medium"]
  );
});

test("set remains incomplete when multiple missing difficulties remain", () => {
  assert.deepEqual(
    buildMissingDifficultySequence(
      {
        easy: 1,
        medium: 1,
        hard: 1,
      },
      ["easy"]
    ),
    ["medium", "hard"]
  );
});
