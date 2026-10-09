import assert from "node:assert/strict";
import test from "node:test";
import { generatedTopicMatchesRequested } from "../lib/generation-topic-validation.mjs";

test("EM17 permits a rate/work application to map from Algebra into requested Modeling", () => {
  assert.equal(
    generatedTopicMatchesRequested({
      expectedTopic: "Modeling",
      generatedTopic: "Algebra",
      sectionKey: "math",
      question: {
        question_text:
          "Two pumps fill a tank. After both run together for 2 minutes, one pump stops. How many total minutes does it take to fill the tank?",
        explanation:
          "Construct rates for each pump, calculate the amount filled together, then apply the remaining-volume rate model.",
      },
    }),
    true
  );
});

test("topic matching remains exact outside the narrow Modeling rate/work exception", () => {
  assert.equal(
    generatedTopicMatchesRequested({
      expectedTopic: "Modeling",
      generatedTopic: "Geometry",
      sectionKey: "math",
      question: {
        question_text: "A circle has radius 4. What is its area?",
        explanation: "Use pi r squared.",
      },
    }),
    false
  );
  assert.equal(
    generatedTopicMatchesRequested({
      expectedTopic: "Algebra",
      generatedTopic: "Modeling",
      sectionKey: "math",
      question: {
        question_text: "Two pumps fill a tank together.",
        explanation: "Use a rate model.",
      },
    }),
    false
  );
});
