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

test("Validation 03 Geometry segment-extension premise is blocked", () => {
  const review = reviewQuestionQuality({
    id: "math-scale-validation-03-geometry-segment-extension",
    section: "math",
    topic: "Geometry",
    difficulty: "medium",
    passage: null,
    question_text:
      "In triangle ABC, points D and E lie on sides AB and AC respectively. The ratios AD:DB = 2:3 and AE:EC = 1:4. Segments DE and BC intersect at point F. What is the ratio BF:FC?",
    choices: { A: "2:5", B: "3:8", C: "4:7", D: "5:9" },
    correct_answer: "B",
    explanation:
      "Line DE meets line BC at F, which lies beyond B. Thus BF:FC = 3:8.",
  });

  assert.equal(review.shouldServe, false);
  assert.equal(review.findings.evidenceSupported, "fail");
  assert(review.blockingFlags.some((flag) => flag.code === "geometry-unstated-segment-extension"));
});

test("explicit line intersection remains eligible when its point lies beyond a segment endpoint", () => {
  const review = reviewQuestionQuality({
    id: "geometry-explicit-line-extension",
    section: "math",
    topic: "Geometry",
    difficulty: "medium",
    passage: null,
    question_text:
      "In triangle ABC, points D and E lie on sides AB and AC respectively. Lines DE and BC intersect at point F. Point F lies beyond B on line BC. What is the ratio BF:FC?",
    choices: { A: "1:2", B: "2:3", C: "3:4", D: "4:5" },
    correct_answer: "B",
    explanation: "The stated lines, rather than finite segments, meet at F beyond B.",
  });

  assert.equal(review.blockingFlags.some((flag) => flag.code === "geometry-unstated-segment-extension"), false);
});

test("English leave-in-place and move-to-current-position choices are equivalent", () => {
  const review = reviewQuestionQuality({
    id: "english-current-position-equivalence",
    section: "english",
    topic: "Organization & Flow",
    difficulty: "easy",
    passage:
      "The city’s annual marathon draws thousands of runners each spring. [underline]Spectators line the streets, cheering and offering water stations.[/underline] Organizers begin planning the route months in advance.",
    question_text: "Which revision would most improve the organization and flow of the paragraph?",
    choices: {
      A: "Leave the underlined sentence where it is.",
      B: "Move the underlined sentence to follow the third sentence.",
      C: "Move the underlined sentence to follow the first sentence.",
      D: "Delete the underlined sentence.",
    },
    correct_answer: "B",
    explanation: "Choice B creates a more logical chronological sequence.",
  });

  assert.equal(review.findings.choicesDistinct, "fail");
  assert(review.blockingFlags.some((flag) => flag.code === "equivalent-english-revision-actions"));
  assert.equal(review.shouldServe, false);
});

test("distinct English movement choices remain eligible for review", () => {
  const review = reviewQuestionQuality({
    id: "english-distinct-movement-actions",
    section: "english",
    topic: "Organization & Flow",
    difficulty: "easy",
    passage:
      "The city’s annual marathon draws thousands of runners each spring. [underline]Spectators line the streets, cheering and offering water stations.[/underline] Organizers begin planning the route months in advance. The event raises funds for local charities.",
    question_text: "Which revision would most improve the organization and flow of the paragraph?",
    choices: {
      A: "Leave the underlined sentence where it is.",
      B: "Move the underlined sentence to follow the third sentence.",
      C: "Move the underlined sentence to follow the second sentence.",
      D: "Delete the underlined sentence.",
    },
    correct_answer: "B",
    explanation: "Choice B places the spectator details after the planning details.",
  });

  assert.equal(review.findings.choicesDistinct, "pass");
  assert.equal(review.blockingFlags.some((flag) => flag.code === "equivalent-english-revision-actions"), false);
});

test("EM01 detects placement choices that resolve to the current position", () => {
  const review = reviewQuestionQuality({
    id: "EM01-duplicate-placement",
    section: "english",
    topic: "Organization & Flow",
    difficulty: "hard",
    passage:
      "Urban beekeeping has surged in popularity over the past decade, offering city dwellers a chance to support pollinator populations. [underline]While honeybees have been domesticated for millennia, their role in modern agriculture remains a topic of debate.[/underline] Recent surveys indicate that rooftop hives can produce comparable honey yields to rural apiaries. However, the density of hives in densely populated areas raises concerns about disease transmission among colonies. Moreover, city planners must consider the placement of hives to avoid conflicts with building codes and resident complaints. Understanding both the historical significance and contemporary challenges of beekeeping can guide effective policy development.",
    question_text: "Which of the following is the best place to insert the underlined sentence in the passage?",
    choices: {
      A: "After sentence 1",
      B: "After sentence 3",
      C: "After sentence 5",
      D: "Keep the sentence where it is",
    },
    correct_answer: "A",
    explanation: "The historical context belongs after the opening sentence.",
  });

  assert.equal(review.findings.choicesDistinct, "fail");
  assert(review.blockingFlags.some((flag) => flag.code === "equivalent-english-revision-actions"));
});

test("EM05 blocks a transition blank where no choice supplies the required subject", () => {
  const review = reviewQuestionQuality({
    id: "EM05-no-grammatical-completion",
    section: "english",
    topic: "Transitions & Cohesion",
    difficulty: "medium",
    passage:
      "Recent studies have shown that urban green spaces improve mental health. However, many city planners overlook the importance of maintaining these areas. [underline]______[/underline] leads to a decline in community well-being.",
    question_text: "Which choice best fills the blank to create a logical connection between the sentences?",
    choices: { A: "Consequently", B: "Nevertheless", C: "In addition", D: "For example" },
    correct_answer: "A",
    explanation: "Consequently signals a cause-effect relationship.",
  });

  assert(review.blockingFlags.some((flag) => flag.code === "no-grammatical-transition-completion"));
  assert.equal(review.shouldServe, false);
});

test("EM12 layered piecewise composition is not flagged as routine formula substitution", () => {
  const review = reviewQuestionQuality({
    id: "EM12-layered-piecewise-composition",
    section: "math",
    topic: "Functions",
    difficulty: "medium",
    passage: null,
    question_text:
      "The function f is defined by cases: f(x)=x+2 for x less than or equal to 0 and f(x)=3x-1 for x greater than 0. What is the sum of all real numbers x that satisfy f(f(x))=4?",
    choices: { A: "5/9", B: "1/3", C: "2/3", D: "1" },
    correct_answer: "A",
    explanation:
      "The composition requires separate branch cases. The valid solutions are -1/3 and 8/9, whose sum is 5/9.",
  });

  assert.equal(review.warningFlags.some((flag) => flag.code === "formula-substitution-math"), false);
});

test("EM18 layered vertex and single-intersection reasoning is not flagged as routine formula substitution", () => {
  const review = reviewQuestionQuality({
    id: "EM18-layered-quadratic-intersection",
    section: "math",
    topic: "Algebra",
    difficulty: "hard",
    passage: null,
    question_text:
      "The quadratic function f(x) has its vertex at (2, -3) and passes through (0, 5). Another quadratic g(x)=x^2+px+q intersects f(x) at exactly one point, and that point is the vertex of f. What is p?",
    choices: { A: "-2", B: "-4", C: "0", D: "3" },
    correct_answer: "B",
    explanation:
      "Derive f from vertex information, use the vertex as the shared point, and use the discriminant condition for exactly one intersection. This gives p=-4.",
  });

  assert.equal(review.warningFlags.some((flag) => flag.code === "formula-substitution-math"), false);
});

test("the Validation Batch 02 Functions system is not flagged as routine formula substitution", () => {
  const review = reviewQuestionQuality({
    id: "validation-02-derived-quadratic-parameters",
    section: "math",
    topic: "Functions",
    difficulty: "medium",
    passage: null,
    question_text:
      "A quadratic function f is defined for all real numbers by f(x)=ax^2+bx+c, where a, b, and c are constants. It is known that f(1)=2, f(2)=3, the parabola opens upward, and the vertex of the parabola lies on the line y = x + 1. What is f(3)?",
    choices: { A: "2", B: "4", C: "8", D: "6" },
    correct_answer: "D",
    explanation:
      "The two function values determine b and c in terms of a. Combining the vertex-on-a-line condition with those equations gives a^2=1; opening upward gives a=1, so f(x)=x^2-2x+3 and f(3)=6.",
  });

  assert.equal(review.warningFlags.some((flag) => flag.code === "formula-substitution-math"), false);
});

test("routine function evaluation remains flagged as formula substitution", () => {
  const review = reviewQuestionQuality({
    id: "routine-function-evaluation",
    section: "math",
    topic: "Functions",
    difficulty: "medium",
    passage: null,
    question_text: "For f(x)=3x+2, what is f(5)?",
    choices: { A: "13", B: "15", C: "17", D: "25" },
    correct_answer: "C",
    explanation: "Substitute 5 for x: f(5)=3(5)+2=17.",
  });

  assert(review.warningFlags.some((flag) => flag.code === "formula-substitution-math"));
});

test("EM16 catches a distractor rationale that assigns the no-discount result to the wrong choice", () => {
  const review = reviewQuestionQuality({
    id: "EM16-incorrect-distractor-rationale",
    section: "math",
    topic: "Number & Quantity",
    difficulty: "easy",
    passage: null,
    question_text:
      "A pack of 12 pencils costs $3.60. If a customer buys 5 packs and receives a 10% discount on the total purchase price, what is the total amount the customer pays?",
    choices: { A: "$15.30", B: "$16.20", C: "$17.10", D: "$18.00" },
    correct_answer: "B",
    explanation:
      "The total before discount is $18.00 and the discounted total is $16.20, choice B. Choice A forgets to apply the discount, while D ignores the discount altogether.",
  });

  assert(review.blockingFlags.some((flag) => flag.code === "incorrect-distractor-rationale"));
  assert.equal(review.findings.explanationVerified, "fail");
});

test("math pack-size distractor issue is retained as a warning", () => {
  const review = reviewQuestionQuality({
    id: "math-pack-size-distractors",
    section: "math",
    topic: "Number & Quantity",
    difficulty: "easy",
    passage: null,
    question_text:
      "A pack of 5 regular pens costs $3 and a pack of 8 premium pens costs $5. A customer wants exactly 40 pens. How many premium pens will the customer purchase?",
    choices: { A: "0", B: "5", C: "8", D: "10" },
    correct_answer: "A",
    explanation:
      "Eight regular packs provide 40 pens for $24, while five premium packs provide 40 pens for $25.",
  });

  assert(review.warningFlags.some((flag) => flag.code === "non-diagnostic-pack-distractors"));
  assert.equal(review.shouldServe, true);
});
