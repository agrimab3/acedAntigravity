import test from "node:test";
import assert from "node:assert/strict";
import { reviewQuestionQuality } from "../lib/question-utils.ts";

test("science no-valid-answer case does not classify clean", () => {
  const review = reviewQuestionQuality({
    id: "science-no-valid-answer",
    section: "science",
    topic: "Data Representation",
    difficulty: "medium",
    passage: [
      "Figure 1 shows plant height results from a study comparing three fertilizer conditions.",
      "Week 2: Control = 5.1 cm, Fertilizer A = 5.0 cm, Fertilizer B = 5.2 cm.",
      "Week 4: Control = 5.8 cm, Fertilizer A = 5.9 cm, Fertilizer B = 6.0 cm.",
      "Week 6: Control = 6.4 cm, Fertilizer A = 6.8 cm, Fertilizer B = 7.0 cm.",
    ].join(" "),
    question_text: "Based on Figure 1, which statement best describes the overall trend in plant height?",
    choices: {
      A: "Fertilizer B started lower but surpassed the Control after week 4.",
      B: "Fertilizer B outperformed the Control by at least 1 cm at every measurement.",
      C: "Control remained taller than Fertilizer B at every measurement.",
      D: "Both fertilizer groups declined after week 4.",
    },
    correct_answer: "A",
    explanation:
      "Fertilizer B ends the study above the Control, but the week 2 values already show Fertilizer B slightly higher than the Control.",
  });

  assert.equal(review.shouldServe, false);
  assert(review.blockingFlags.some((flag) => flag.code === "no-supported-choice"));
  assert.equal(review.findings.uniqueCorrectAnswer, "fail");
  assert.equal(review.findings.answerKeyVerified, "fail");
});

test("production science contradiction case does not classify clean", () => {
  const review = reviewQuestionQuality({
    id: "science-production-no-valid-answer",
    section: "science",
    topic: "Data Representation",
    difficulty: "medium",
    passage: [
      "Plant height was measured for seedlings in a Control group and a Fertilizer B group over eight weeks.",
      "Week 2: Control = 5.1 cm, Fertilizer B = 5.2 cm.",
      "Week 4: Control = 7.0 cm, Fertilizer B = 7.8 cm.",
      "Week 6: Control = 8.5 cm, Fertilizer B = 9.9 cm.",
      "Week 8: Control = 9.0 cm, Fertilizer B = 11.5 cm.",
    ].join(" "),
    question_text:
      "Which statement best describes the overall trend for Fertilizer B compared to the Control group over the eight weeks?",
    choices: {
      A: "Fertilizer B consistently outperformed the Control by at least 1 cm at each measurement.",
      B: "Fertilizer B started lower but surpassed the Control after week 4.",
      C: "Fertilizer B and the Control had identical growth patterns.",
      D: "Fertilizer B showed no growth after week 4.",
    },
    correct_answer: "B",
    explanation:
      "Choice B is correct because Fertilizer B began slightly lower than the Control but surpassed it after week 4.",
  });

  assert.equal(review.shouldServe, false);
  assert.equal(review.autoPublishEligible, false);
  assert(review.blockingFlags.some((flag) => flag.code === "no-supported-choice"));
  assert(review.blockingFlags.some((flag) => flag.code === "explanation-stimulus-contradiction"));
  assert.equal(review.findings.uniqueCorrectAnswer, "fail");
  assert.equal(review.findings.answerKeyVerified, "fail");
  assert.equal(review.findings.explanationVerified, "fail");
});

test("equivalent answer-choice case does not classify clean", () => {
  const review = reviewQuestionQuality({
    id: "science-equivalent-choices",
    section: "science",
    topic: "Data Representation",
    difficulty: "medium",
    passage: [
      "A graph shows the average seedling height at weeks 4 and 6 during a greenhouse study.",
      "Week 4: Control = 8.0 cm, Fertilizer A = 8.8 cm, Fertilizer B = 8.4 cm.",
      "Week 6: Control = 9.0 cm, Fertilizer A = 10.0 cm, Fertilizer B = 9.6 cm.",
    ].join(" "),
    question_text:
      "If a researcher wanted to estimate the average height of Fertilizer A plants at week 5, which method would be most appropriate?",
    choices: {
      A: "Use the average of the week 4 and week 6 values.",
      B: "Use linear interpolation between week 4 and week 6.",
      C: "Use only the week 6 value because it is the closest measured point.",
      D: "Use the Control group's week 5 estimate instead.",
    },
    correct_answer: "A",
    explanation:
      "Because week 5 falls halfway between weeks 4 and 6, taking the midpoint of those two measurements gives the same estimate as linear interpolation.",
  });

  assert.equal(review.shouldServe, false);
  assert(review.blockingFlags.some((flag) => flag.code === "equivalent-choices"));
  assert.equal(review.findings.choicesDistinct, "fail");
});

test("unsupported acceleration conclusion does not classify clean", () => {
  const review = reviewQuestionQuality({
    id: "science-unsupported-acceleration",
    section: "science",
    topic: "Data Representation",
    difficulty: "medium",
    passage: [
      "Researchers tracked plant height every two weeks in a controlled greenhouse experiment.",
      "Week 4: Control = 6.0 cm, Fertilizer A = 6.3 cm, Fertilizer B = 6.5 cm.",
      "Week 6: Control = 6.7 cm, Fertilizer A = 7.1 cm, Fertilizer B = 7.3 cm.",
      "Week 8: Control = 7.2 cm, Fertilizer A = 8.8 cm, Fertilizer B = 8.9 cm.",
    ].join(" "),
    question_text:
      "Which conclusion is best supported by the data from weeks 6 through 8?",
    choices: {
      A: "Fertilizer A accelerates growth more than Fertilizer B during weeks 6 through 8.",
      B: "Fertilizer A shows a slightly larger increase in height than Fertilizer B during weeks 6 through 8.",
      C: "Control plants grow faster than both fertilizer groups during weeks 6 through 8.",
      D: "Fertilizer B decreases in height during weeks 6 through 8.",
    },
    correct_answer: "A",
    explanation:
      "Fertilizer A increases by 1.7 cm from week 6 to week 8, while Fertilizer B increases by 1.6 cm over the same interval.",
  });

  assert.equal(review.warningFlags.some((flag) => flag.code === "unsupported-acceleration-wording"), true);
  assert.equal(review.autoPublishEligible, false);
});

test("valid science item still passes deterministic review", () => {
  const review = reviewQuestionQuality({
    id: "science-valid",
    section: "science",
    topic: "Data Representation",
    difficulty: "easy",
    passage: [
      "Figure 2 summarizes the average stem height in a greenhouse study after plants received three different soil treatments.",
      "Week 2: Control = 5.4 cm, Fertilizer A = 5.7 cm, Fertilizer B = 5.5 cm.",
      "Week 4: Control = 6.1 cm, Fertilizer A = 6.8 cm, Fertilizer B = 6.4 cm.",
      "Week 6: Control = 6.7 cm, Fertilizer A = 7.5 cm, Fertilizer B = 7.0 cm.",
    ].join(" "),
    question_text: "According to Figure 2, which treatment produced the tallest plants at week 6?",
    choices: {
      A: "Control",
      B: "Fertilizer A",
      C: "Fertilizer B",
      D: "All three treatments produced the same height.",
    },
    correct_answer: "B",
    explanation:
      "At week 6, Fertilizer A reaches 7.5 cm, which is greater than the heights for Fertilizer B and the Control group.",
  });

  assert.equal(review.shouldServe, true);
  assert.equal(review.blockingFlags.length, 0);
  assert.equal(review.warningFlags.length, 0);
});
