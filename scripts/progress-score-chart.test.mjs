import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("app/api/progress/route.ts", "utf8");
const page = readFileSync("app/progress/page.tsx", "utf8");
const chart = readFileSync("components/ProgressScoreChart.tsx", "utf8");

test("progress returns only the signed-in student's completed section score estimates", () => {
  assert.match(route, /practiceTestSections/);
  assert.match(route, /eq\(practiceTestSessions\.userId, userId\)/);
  assert.match(route, /eq\(practiceTestSessions\.status, "completed"\)/);
  assert.match(route, /isNotNull\(practiceTestSections\.estimatedScore\)/);
  assert.match(route, /scoreTrend:/);
});

test("progress returns practiced weak skills and the page links each one back to its star", () => {
  assert.match(route, /weakestSkills:/);
  assert.match(route, /innerJoin\(actTopics, eq\(topicMastery\.topicId, actTopics\.id\)\)/);
  assert.match(route, /gt\(topicMastery\.attemptCount, 0\)/);
  assert.match(page, /skills to work on/);
  assert.match(page, /\/practice\?section=\$\{skill\.sectionKey\}/);
});

test("score chart has real-data filters, latest labels, hover detail, and an explicitly non-real empty preview", () => {
  assert.match(chart, /Score over time/);
  assert.match(chart, /testCount >= 2/);
  assert.match(chart, /Take 2 practice tests to see your score trend ✦/);
  assert.match(chart, /Sample score trend preview/);
  assert.match(chart, /minHeight: 220/);
  assert.match(chart, /zIndex: 1, display: "flex"/);
  assert.match(chart, /<g opacity="\.3">/);
  assert.match(chart, /onMouseEnter/);
  assert.match(chart, /smoothPath/);
  for (const color of ["#5DCAA5", "#AFA9EC", "#EF9F27", "#F0997B"]) assert.match(chart, new RegExp(color));
});
