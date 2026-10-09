import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFallbackTutorReply,
  decideTutorTurn,
  detectTutorLeak,
  getEffectivePracticeCorrectness,
  looksIncompleteTutorReply,
} from "../lib/tutor-guard.ts";

const correctAnswer = "C";
const correctChoiceText = "Use a semicolon because both sides are independent clauses.";
const explanation =
  "Choice C is correct because a semicolon properly joins two closely related independent clauses without a coordinating conjunction.";

function assertNoLeak(reply: string) {
  assert.equal(
    detectTutorLeak({
      reply,
      correctAnswer,
      correctChoiceText,
      explanation,
    }),
    null,
    `unexpected leak in: ${reply}`
  );
}

for (const message of [
  "hi",
  "what's the answer",
  "just tell me",
  "why",
  "explain simpler",
  "is it C?",
  "I think it's B",
]) {
  test(`pre-submission message does not reveal answer: ${message}`, () => {
    const decision = decideTutorTurn({
      message,
      submitted: false,
      hintLevel: 0,
    });

    assert.equal(decision.revealAnswer, false);

    const reply = buildFallbackTutorReply({
      section: "english",
      topic: "Punctuation",
      phase: decision.phase,
      submitted: false,
      requestedAnswerWithoutHint: decision.answerRequestBlocked,
    });

    assertNoLeak(reply);
  });
}

test("three hint requests stay at hint level 1 and never auto-reveal", () => {
  let hintLevel = 0;

  for (let index = 0; index < 3; index += 1) {
    const decision = decideTutorTurn({
      message: "give me a hint",
      action: "hint",
      submitted: false,
      hintLevel,
    });

    assert.equal(decision.phase, "hint");
    assert.equal(decision.revealAnswer, false);
    assert.equal(decision.nextHintLevel, 1);

    const reply = buildFallbackTutorReply({
      section: "math",
      topic: "Algebra",
      phase: decision.phase,
      submitted: false,
    });
    assertNoLeak(reply);
    hintLevel = decision.nextHintLevel;
  }
});

test("show answer is blocked before any hint", () => {
  const decision = decideTutorTurn({
    message: "show answer",
    action: "show_answer",
    submitted: false,
    hintLevel: 0,
  });

  assert.equal(decision.revealAnswer, false);
  assert.equal(decision.answerRequestBlocked, true);

  const reply = buildFallbackTutorReply({
    section: "english",
    phase: decision.phase,
    submitted: false,
    requestedAnswerWithoutHint: true,
  });
  assertNoLeak(reply);
});

test("show answer reveals only after at least one hint", () => {
  const decision = decideTutorTurn({
    message: "show answer",
    action: "show_answer",
    submitted: false,
    hintLevel: 1,
  });

  assert.equal(decision.phase, "reveal");
  assert.equal(decision.revealAnswer, true);
  assert.equal(decision.nextHintLevel, 2);

  const reply = buildFallbackTutorReply({
    section: "english",
    phase: "reveal",
    submitted: false,
    correctAnswer,
    explanation,
  });

  assert.match(reply, /answer is C/i);
  assert.match(reply, /semicolon/i);
});

test("after submission the full answer is allowed", () => {
  const decision = decideTutorTurn({
    message: "why?",
    submitted: true,
    hintLevel: 0,
  });

  assert.equal(decision.phase, "review");

  const reply = buildFallbackTutorReply({
    section: "english",
    phase: "review",
    submitted: true,
    correctAnswer,
    explanation,
  });

  assert.match(reply, /answer is C/i);
  assert.match(reply, /independent clauses/i);
});

test("choice checks never confirm or deny before submission", () => {
  for (const message of ["is it C?", "I think it's B"]) {
    const decision = decideTutorTurn({
      message,
      submitted: false,
      hintLevel: 1,
    });

    assert.equal(decision.phase, "choice_check");
    const reply = buildFallbackTutorReply({
      section: "math",
      phase: "choice_check",
      submitted: false,
    });
    assertNoLeak(reply);
    assert.match(reply, /submit/i);
  }
});

test("incomplete tutor fragments are detected before delivery", () => {
  assert.equal(looksIncompleteTutorReply("Do you recall the relationship between the."), true);
  assert.equal(looksIncompleteTutorReply("Start by writing the relationship before calculating."), false);
});

test("revealing the answer before submission makes a correct selection count as wrong", () => {
  assert.equal(
    getEffectivePracticeCorrectness({
      selectedAnswer: "C",
      correctAnswer: "C",
      answerRevealedBeforeSubmit: true,
    }),
    false
  );

  assert.equal(
    getEffectivePracticeCorrectness({
      selectedAnswer: "C",
      correctAnswer: "C",
      answerRevealedBeforeSubmit: false,
    }),
    true
  );
});

test("leak detector blocks correct-letter, choice-text, and explanation leaks", () => {
  assert.equal(
    detectTutorLeak({
      reply: "The answer is C.",
      correctAnswer,
      correctChoiceText,
      explanation,
    }),
    "correct-letter"
  );

  assert.equal(
    detectTutorLeak({
      reply: `The best choice is: ${correctChoiceText}`,
      correctAnswer,
      correctChoiceText,
      explanation,
    }),
    "correct-choice-text"
  );

  assert.equal(
    detectTutorLeak({
      reply: explanation,
      correctAnswer,
      correctChoiceText,
      explanation,
    }),
    "correct-letter"
  );
});
