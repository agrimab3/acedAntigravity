import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(scriptsDirectory, "..", "generate-questions.mjs");
const fixturePath = path.join(scriptsDirectory, "fixtures", "generation-calibration-batch-02.json");

const source = await readFile(sourcePath, "utf8");
const fixtures = JSON.parse(await readFile(fixturePath, "utf8"));

test("review schema and prompt retain calibration signals", () => {
  for (const signal of [
    "reasoning_depth",
    "computational_burden",
    "distractor_plausibility",
    "answer_directly_stated",
    "act_authenticity",
  ]) {
    assert.match(source, new RegExp(signal));
  }

  assert.match(source, /If removing repetitive arithmetic would make the problem easy/);
  assert.match(source, /hard Science items whose difficulty is mostly repetitive calculation/);
  assert.match(source, /Reading items with weak distractor plausibility/);
  assert.match(source, /unsupported shorthand rule/);
  assert.match(source, /actual syntactic and semantic validity/);
  assert.match(source, /generic style slogan/);
  assert.match(source, /Verify every stated distractor rationale/);
});

test("English generation guidance covers semantic editing and context calibration", () => {
  for (const phrase of [
    "same final passage",
    "no-op movement",
    "4–5 meaningful sentences",
    "malformed substitutions",
    "unsupported tense corrections",
    "multiple marks are defensible",
    "actual edited meaning",
    "meaningful clarity, redundancy, or precision decision",
  ]) {
    assert.ok(source.includes(phrase), `missing guidance: ${phrase}`);
  }
});

test("English guidance regression set distinguishes negative and positive designs", () => {
  const negative = [
    "duplicate Organization placement outcome",
    "malformed transition sentence",
    "unsupported which/that rationale",
    "multiple-defensible punctuation item",
    "unnecessary tense correction",
    "explanation contradicts actual revised order",
  ];
  const positive = [
    "valid Organization & Flow",
    "valid Transition",
    "valid Sentence Structure",
    "valid Punctuation",
    "valid Precision & Concision",
  ];
  assert.equal(negative.length, 6);
  assert.equal(positive.length, 5);
  assert.match(source, /exactly one grammatically valid, semantically appropriate, and contextually best revision/);
});

test("Batch 02 regression fixtures cover every requested calibration failure", () => {
  assert.equal(fixtures.length, 9);
  assert.deepEqual(
    new Set(fixtures.map((fixture) => fixture.id)),
    new Set([
      "science-easy-lookup",
      "science-medium-percent-change",
      "science-hard-repetitive-sums",
      "reading-hard-direct-theme",
      "reading-medium-mood",
      "math-medium-consecutive-even-integers",
      "math-hard-function-composition",
      "english-which-that-rationale",
      "english-punctuation-ambiguity",
    ])
  );

  for (const fixture of fixtures) {
    assert.ok(fixture.prompt.length >= 20, `${fixture.id} should retain a representative prompt`);
    assert.ok(Object.keys(fixture.expectedSignals).length >= 1, `${fixture.id} needs an expected signal`);
  }
});
