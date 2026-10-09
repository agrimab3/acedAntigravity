import assert from "node:assert/strict";
import test from "node:test";
import { selectMissedReviewRecords } from "../lib/practice-review.ts";

const now = new Date("2026-10-09T17:00:00.000Z");
const since = new Date("2026-09-09T17:00:00.000Z");

function record(overrides: Partial<{
  userId: string;
  sessionId: string;
  questionId: string;
  isCorrect: boolean;
  submittedAt: Date;
  usageScope: string;
  section: string;
}> = {}) {
  return {
    userId: "student-a",
    sessionId: "session-1",
    questionId: "question-1",
    isCorrect: false,
    submittedAt: now,
    usageScope: "practice",
    section: "english",
    ...overrides,
  };
}

test("review only returns the signed-in student's missed questions", () => {
  const result = selectMissedReviewRecords({
    records: [
      record({ userId: "student-a", questionId: "own-miss" }),
      record({ userId: "student-b", questionId: "other-student-miss" }),
    ],
    userId: "student-a",
    since,
  });

  assert.deepEqual(result.map((item) => item.questionId), ["own-miss"]);
});

test("mock reserve questions never appear in missed review", () => {
  const result = selectMissedReviewRecords({
    records: [
      record({ questionId: "practice-miss", usageScope: "practice" }),
      record({ questionId: "reserve-miss", usageScope: "mock_reserve" }),
    ],
    userId: "student-a",
    since,
  });

  assert.deepEqual(result.map((item) => item.questionId), ["practice-miss"]);
});

test("a correct retry clears a previously missed question", () => {
  const originalMiss = record({
    questionId: "fixed-question",
    submittedAt: new Date("2026-10-09T16:00:00.000Z"),
  });
  const retryCorrect = record({
    sessionId: "retry-session",
    questionId: "fixed-question",
    isCorrect: true,
    submittedAt: new Date("2026-10-09T16:30:00.000Z"),
  });

  const result = selectMissedReviewRecords({
    records: [originalMiss, retryCorrect],
    userId: "student-a",
    since,
  });

  assert.equal(result.length, 0);
});

test("session review keeps only unresolved misses from that session", () => {
  const sessionMiss = record({
    sessionId: "target-session",
    questionId: "still-missed",
    submittedAt: new Date("2026-10-09T15:00:00.000Z"),
  });
  const otherMiss = record({
    sessionId: "other-session",
    questionId: "other-question",
    submittedAt: new Date("2026-10-09T16:00:00.000Z"),
  });

  const result = selectMissedReviewRecords({
    records: [sessionMiss, otherMiss],
    userId: "student-a",
    sessionId: "target-session",
    since,
  });

  assert.deepEqual(result.map((item) => item.questionId), ["still-missed"]);
});

test("last-30-day review is newest first and honors section filter", () => {
  const result = selectMissedReviewRecords({
    records: [
      record({
        questionId: "older-english",
        submittedAt: new Date("2026-10-01T12:00:00.000Z"),
      }),
      record({
        questionId: "newer-english",
        submittedAt: new Date("2026-10-08T12:00:00.000Z"),
      }),
      record({
        questionId: "math-miss",
        section: "math",
        submittedAt: new Date("2026-10-09T12:00:00.000Z"),
      }),
    ],
    userId: "student-a",
    section: "english",
    since,
  });

  assert.deepEqual(
    result.map((item) => item.questionId),
    ["newer-english", "older-english"]
  );
});
