import test from "node:test";
import assert from "node:assert/strict";
import { buildVerifierProviderOrder } from "../lib/content-generation-providers.mjs";
import {
  buildMissingDifficultySequence,
  buildPromptDifficultyBlueprint,
  decideChildDisposition,
  formatDifficultyReviewerAssessment,
  mergeRevisedChildShape,
  planQuestionSetDifficultyCounts,
  shouldReviseForDifficulty,
  toCanonicalChild,
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

test("accurate difficulty does not trigger revision", () => {
  assert.equal(
    shouldReviseForDifficulty({
      requestedDifficulty: "medium",
      generatedDifficulty: "medium",
      difficultyAccuracy: "accurate",
      suggestedDifficulty: null,
    }),
    false
  );
});

test("matching requested and generated difficulty does not trigger revision", () => {
  assert.equal(
    shouldReviseForDifficulty({
      requestedDifficulty: "hard",
      generatedDifficulty: "hard",
      difficultyAccuracy: "unclear",
      suggestedDifficulty: "hard",
    }),
    false
  );
});

test("too easy review for requested medium triggers revision", () => {
  assert.equal(
    shouldReviseForDifficulty({
      requestedDifficulty: "medium",
      generatedDifficulty: "medium",
      difficultyAccuracy: "too_easy",
      suggestedDifficulty: "easy",
    }),
    true
  );
});

test("revision merge preserves section topic and requested difficulty", () => {
  const merged = mergeRevisedChildShape({
    originalChild: {
      section: "science",
      topic: "Data Representation",
      difficulty: "medium",
      question_text: "Original prompt",
      choices: {
        A: "1",
        B: "2",
        C: "3",
        D: "4",
      },
      correct_answer: "B",
      explanation: "Original explanation with enough detail to pass validation.",
    },
    revisedFields: {
      question_text: "Revised prompt",
      explanation: "Revised explanation with enough detail to pass validation cleanly.",
    },
    requestedDifficulty: "hard",
    section: "science",
    topic: "Data Representation",
  });

  assert.deepEqual(merged, {
    section: "science",
    topic: "Data Representation",
    difficulty: "hard",
    question_text: "Revised prompt",
    choices: {
      A: "1",
      B: "2",
      C: "3",
      D: "4",
    },
    correct_answer: "B",
    explanation: "Revised explanation with enough detail to pass validation cleanly.",
  });
});

test("malformed revision fragments still preserve the full canonical child shape", () => {
  const merged = mergeRevisedChildShape({
    originalChild: {
      section: "reading",
      topic: "Natural Science",
      difficulty: "easy",
      question_text: "Original reading prompt",
      choices: {
        A: "Alpha",
        B: "Beta",
        C: "Gamma",
        D: "Delta",
      },
      correct_answer: "A",
      explanation: "Original explanation with sufficient detail for validation purposes.",
    },
    revisedFields: {
      section: "math",
      topic: "Functions",
      difficulty: "medium",
    },
    requestedDifficulty: "easy",
    section: "reading",
    topic: "Natural Science",
  });

  assert.equal(merged.section, "reading");
  assert.equal(merged.topic, "Natural Science");
  assert.equal(merged.difficulty, "easy");
  assert.equal(merged.question_text, "Original reading prompt");
  assert.equal(merged.correct_answer, "A");
});

test("difficulty reviewer formatting stays explicit", () => {
  assert.equal(
    formatDifficultyReviewerAssessment({
      difficultyAccuracy: "too_easy",
      suggestedDifficulty: "easy",
    }),
    "too_easy->easy"
  );
});

test("keep plus accurate maps to accept", () => {
  assert.equal(
    decideChildDisposition({
      reviewerVerdict: "keep",
      requestedDifficulty: "easy",
      generatedDifficulty: "easy",
      difficultyAccuracy: "accurate",
      suggestedDifficulty: null,
      hasHardFailure: false,
    }),
    "accept"
  );
});

test("keep plus accurate is never skip-like", () => {
  assert.notEqual(
    decideChildDisposition({
      reviewerVerdict: "keep",
      requestedDifficulty: "medium",
      generatedDifficulty: "medium",
      difficultyAccuracy: "accurate",
      suggestedDifficulty: "medium",
      hasHardFailure: false,
    }),
    "reject"
  );
});

test("review response metadata cannot be mistaken for a canonical child", () => {
  assert.throws(
    () =>
      toCanonicalChild(
        {
          verdict: "keep",
          confidence: "high",
          correctness: "correct",
          difficulty_accuracy: "accurate",
        },
        {
          section: "science",
          topic: "Data Representation",
          requestedDifficulty: "medium",
        }
      ),
    /review metadata/
  );
});

test("canonical child guard accepts a complete child object", () => {
  const canonical = toCanonicalChild(
    {
      section: "science",
      topic: "Data Representation",
      difficulty: "medium",
      question_text: "Which statement is best supported by the figure data?",
      choices: {
        A: "Choice A",
        B: "Choice B",
        C: "Choice C",
        D: "Choice D",
      },
      correct_answer: "B",
      explanation: "Choice B matches the plotted values while the others contradict the figure.",
    },
    {
      section: "science",
      topic: "Data Representation",
      requestedDifficulty: "medium",
    }
  );

  assert.equal(canonical.section, "science");
  assert.equal(canonical.topic, "Data Representation");
  assert.equal(canonical.difficulty, "medium");
  assert.equal(canonical.correct_answer, "B");
});

test("canonical child guard fails locally with a clean missing-fields error", () => {
  assert.throws(
    () =>
      toCanonicalChild(
        {
          section: "science",
        },
        {
          section: "science",
          topic: "Data Representation",
          requestedDifficulty: "hard",
        }
      ),
    /missing required fields/
  );
});

test("suggested difficulty matching the requested difficulty still accepts keep", () => {
  assert.equal(
    decideChildDisposition({
      reviewerVerdict: "keep",
      requestedDifficulty: "hard",
      generatedDifficulty: "hard",
      difficultyAccuracy: "accurate",
      suggestedDifficulty: "hard",
      hasHardFailure: false,
    }),
    "accept"
  );
});

test("verifier prefers a different provider than the generator when available", () => {
  const order = buildVerifierProviderOrder("groq", "groq", {
    GROQ_API_KEY: "groq-key",
    GEMINI_API_KEY: "gemini-key",
    OPENROUTER_API_KEY: "openrouter-key",
  });

  assert.deepEqual(order, ["gemini", "openrouter", "groq"]);
  assert.equal(order[0], "gemini");
});

test("openrouter generator prefers groq then gemini for verification independence", () => {
  const order = buildVerifierProviderOrder("openrouter", "openrouter", {
    GROQ_API_KEY: "groq-key",
    GEMINI_API_KEY: "gemini-key",
    OPENROUTER_API_KEY: "openrouter-key",
  });

  assert.deepEqual(order, ["groq", "gemini", "openrouter"]);
});
