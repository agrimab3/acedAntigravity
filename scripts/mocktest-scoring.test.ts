import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCompositeDistribution,
  calculateEnhancedComposite,
  calculatePercentile,
  estimateActScaleScore,
} from "../lib/mockTest/scoring.ts";

test("section score uses round(1 + 35 * correct / total)", () => {
  assert.equal(estimateActScaleScore(41, 50), 30);
  assert.equal(estimateActScaleScore(0, 50), 1);
  assert.equal(estimateActScaleScore(50, 50), 36);
});

test("all blank is the same raw score as zero correct", () => {
  assert.equal(estimateActScaleScore(0, 45), 1);
  assert.equal(estimateActScaleScore(0, 36), 1);
  assert.equal(estimateActScaleScore(0, 40), 1);
});

test("composite rounds .5 up", () => {
  assert.equal(calculateEnhancedComposite({ english: 30, math: 30, reading: 31.5 }), 31);
  assert.equal(calculateEnhancedComposite({ english: 29, math: 30, reading: 31 }), 30);
});

test("percentile counts only students with strictly lower composites", () => {
  const cohort = [20, 24, 24, 27, 30];
  assert.equal(calculatePercentile(24, cohort), 20);
  assert.equal(calculatePercentile(27, cohort), 60);
  assert.equal(calculatePercentile(20, cohort), 0);
});

test("composite distribution includes every score 1 through 36", () => {
  const distribution = buildCompositeDistribution([1, 24, 24, 36]);
  assert.equal(Object.keys(distribution).length, 36);
  assert.equal(distribution["1"], 1);
  assert.equal(distribution["24"], 2);
  assert.equal(distribution["36"], 1);
  assert.equal(distribution["25"], 0);
});
