import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../generate-questions.mjs", import.meta.url), "utf8");

const negativeFixtures = [
  "bare solve-for-x",
  "direct arithmetic drill",
  "trivial formula substitution",
  "generic discount, ticket, pencil, or unit-rate worksheet",
];

const positiveFixtures = [
  "choose an equation from a realistic context",
  "interpret a representation",
  "apply one constraint",
  "light proportional reasoning",
  "simple geometry",
  "basic statistics/probability situation",
];

test("easy Math generation guidance excludes the known worksheet fixtures", () => {
  for (const fixture of negativeFixtures) {
    assert.match(source, new RegExp(fixture.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});

test("easy Math generation guidance requires accessible but meaningful positive fixtures", () => {
  for (const fixture of positiveFixtures) {
    assert.match(source, new RegExp(fixture.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  assert.match(source, /distractor.*plausible.*setup.*unit.*relationship.*interpretation/i);
  assert.match(source, /sectionKey !== "math" \|\| requestedDifficulty !== "easy"/);
});

const originalityFixtures = {
  negative: [
    { difficulty: "easy", pattern: "generic discount worksheet" },
    { difficulty: "medium", pattern: "predictable one-formula classroom drill" },
    { difficulty: "hard", pattern: "routine algebra made hard by length" },
  ],
  positive: [
    { difficulty: "easy", pattern: "one meaningful setup or interpretation decision" },
    { difficulty: "medium", pattern: "selecting or transforming the right representation" },
    { difficulty: "hard", pattern: "layered interpretation, constraints, modeling, or efficient synthesis" },
  ],
};

test("Math originality regression set covers easy, medium, and hard negative patterns", () => {
  assert.equal(originalityFixtures.negative.length, 3);
  assert.deepEqual(originalityFixtures.negative.map((fixture) => fixture.difficulty), ["easy", "medium", "hard"]);
  assert.match(source, /generic discount, ticket, pencil, or unit-rate worksheet/i);
  assert.match(source, /selecting or transforming the right representation, constraint, or relationship/i);
  assert.match(source, /Do not create medium or hard difficulty through algebra length/i);
});

test("Math originality regression set covers easy, medium, and hard positive patterns", () => {
  assert.equal(originalityFixtures.positive.length, 3);
  assert.deepEqual(originalityFixtures.positive.map((fixture) => fixture.difficulty), ["easy", "medium", "hard"]);
  for (const fixture of originalityFixtures.positive) {
    assert.match(source, new RegExp(fixture.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  assert.match(source, /Build distractors from distinct, diagnosable wrong models/i);
});
