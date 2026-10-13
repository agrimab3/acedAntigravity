import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { getReservePreviewLocation, getReservePreviewNavigation, reservePreviewHref } from "../lib/mockTest/reservePreview.ts";

const form = JSON.parse(fs.readFileSync("docs/dec5-reviewed-form.json", "utf8"));
const science = form.questions.filter((question) => question.section_key === "science");

test("Form A Science preview data starts at Q1 and preserves all 40 ordered questions", () => {
  assert.equal(form.checksum, "bef8928108d320165c2131550074d95ec70a123cb39505f90191ffc5ac57518a");
  assert.equal(science.length, 40);
  const firstNotes = JSON.parse(science[0].review_notes);
  const lastNotes = JSON.parse(science[39].review_notes);
  assert.equal(firstNotes.questionNumber, 1);
  assert.equal(lastNotes.questionNumber, 40);
  assert.equal(firstNotes.passageNumber, "I");
  assert.equal(lastNotes.passageNumber, "VI");
  assert.equal(firstNotes.passageTitle, "Seeds and Soil Temperature");
  assert.match(science[0].passage, /Farmers often plant seeds/);
});

test("Science preview URLs start at Q1 and stop at Q40", () => {
  assert.deepEqual(getReservePreviewLocation({ section: "science" }), { section: "science", question: 1, total: 40 });
  assert.deepEqual(getReservePreviewLocation({ section: "science", question: "40" }), { section: "science", question: 40, total: 40 });
  assert.equal(reservePreviewHref("science", 1), "?section=science&question=1");
  assert.equal(reservePreviewHref("science", 2), "?section=science&question=2");
  assert.equal(reservePreviewHref("science", 39), "?section=science&question=39");
  assert.equal(reservePreviewHref("science", 40), "?section=science&question=40");
  assert.deepEqual(getReservePreviewNavigation("science", 1), { previous: null, next: "?section=science&question=2" });
  assert.deepEqual(getReservePreviewNavigation("science", 40), { previous: "?section=science&question=39", next: null });
  assert.deepEqual(getReservePreviewLocation({ section: "english" }), { section: "english", question: 1, total: 50 });
  assert.deepEqual(getReservePreviewLocation({ section: "math" }), { section: "math", question: 1, total: 45 });
  assert.equal(getReservePreviewLocation({ section: "reading" }).question, 35);
});

test("Science passages contain rendered-table source and captions", () => {
  const tableQuestions = science.filter((question) => question.passage.includes("**Table "));
  assert.equal(tableQuestions.length, 33);
  for (const question of tableQuestions) {
    assert.match(question.passage, /\*\*Table \d+(?::.*?)?\*\*/);
    assert.match(question.passage, /^\|/m);
  }
});

test("actual admin preview renderer renders every Science Q1–Q40", () => {
  const result = spawnSync(process.execPath, ["scripts/dry-run-dec5-form-render.mjs"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout.trim());
  assert.equal(report.counts.science, 40);
  assert.equal(report.rendered, 126);
});
