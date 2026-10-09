import test from "node:test";
import assert from "node:assert/strict";
import {
  selectBalancedIndividuals,
  selectWholeSets,
} from "../lib/mockTest/formAssembler.mjs";

function q(id, topicName, difficulty) {
  return { id, topicName, difficulty };
}

test("selectWholeSets hits exact science count without splitting sets", () => {
  const groups = [
    { id: "s1", questions: [1, 2, 3, 4, 5, 6].map((n) => q(`s1-${n}`, "Data Representation", n % 3 === 0 ? "hard" : n % 2 === 0 ? "medium" : "easy")) },
    { id: "s2", questions: [1, 2, 3, 4, 5, 6].map((n) => q(`s2-${n}`, "Research Summaries", n % 3 === 0 ? "hard" : n % 2 === 0 ? "medium" : "easy")) },
    { id: "s3", questions: [1, 2, 3, 4, 5, 6].map((n) => q(`s3-${n}`, "Conflicting Viewpoints", n % 3 === 0 ? "hard" : n % 2 === 0 ? "medium" : "easy")) },
    { id: "s4", questions: [1, 2, 3, 4, 5, 6].map((n) => q(`s4-${n}`, "Data Representation", n % 3 === 0 ? "hard" : n % 2 === 0 ? "medium" : "easy")) },
    { id: "s5", questions: [1, 2, 3, 4, 5, 6].map((n) => q(`s5-${n}`, "Research Summaries", n % 3 === 0 ? "hard" : n % 2 === 0 ? "medium" : "easy")) },
    { id: "s6", questions: [1, 2, 3, 4, 5, 6].map((n) => q(`s6-${n}`, "Conflicting Viewpoints", n % 3 === 0 ? "hard" : n % 2 === 0 ? "medium" : "easy")) },
    { id: "s7", questions: [1, 2, 3, 4].map((n) => q(`s7-${n}`, "Conflicting Viewpoints", n === 4 ? "hard" : n === 3 ? "medium" : "easy")) },
  ];

  const selected = selectWholeSets(groups, 40);
  assert(selected);
  assert.equal(selected.questions.length, 40);

  const selectedIds = new Set(selected.groups.map((group) => group.id));
  for (const group of groups) {
    const childCount = selected.questions.filter((question) => question.id.startsWith(`${group.id}-`)).length;
    assert(childCount === 0 || childCount === group.questions.length);
    assert.equal(childCount > 0, selectedIds.has(group.id));
  }
});

test("selectWholeSets refuses when complete sets cannot make the exact count", () => {
  const groups = Array.from({ length: 7 }, (_, index) => ({
    id: `set-${index}`,
    questions: Array.from({ length: 6 }, (__, childIndex) =>
      q(`${index}-${childIndex}`, "Data Representation", "medium")
    ),
  }));

  assert.equal(selectWholeSets(groups, 40), null);
});

test("selectBalancedIndividuals spreads selection across topics and difficulties", () => {
  const candidates = [];
  for (const topic of ["A", "B", "C", "D"]) {
    for (const difficulty of ["easy", "medium", "hard"]) {
      for (let index = 0; index < 8; index += 1) {
        candidates.push(q(`${topic}-${difficulty}-${index}`, topic, difficulty));
      }
    }
  }

  const selected = selectBalancedIndividuals(candidates, 24);
  assert(selected);
  assert.equal(selected.length, 24);

  const topics = new Map();
  const difficulties = new Map();
  for (const question of selected) {
    topics.set(question.topicName, (topics.get(question.topicName) ?? 0) + 1);
    difficulties.set(question.difficulty, (difficulties.get(question.difficulty) ?? 0) + 1);
  }

  assert(Math.max(...topics.values()) - Math.min(...topics.values()) <= 1);
  assert(Math.max(...difficulties.values()) - Math.min(...difficulties.values()) <= 1);
});
