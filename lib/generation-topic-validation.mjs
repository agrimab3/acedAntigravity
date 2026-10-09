function normalize(value) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isRateOrWorkModelingQuestion(question) {
  const combined = `${question.question_text ?? ""} ${question.explanation ?? ""}`.toLowerCase();
  const realWorldSetup = /\b(pump|tank|worker|workers|machine|machines|fills?|work(?:ing)?|rate|mixture|cost|distance|production)\b/.test(
    combined
  );
  const modelConstruction = /\b(rate|per minute|per hour|remaining|together|alone|constraint|equation|model)\b/.test(
    combined
  );
  return realWorldSetup && modelConstruction;
}

export function generatedTopicMatchesRequested({ expectedTopic, generatedTopic, sectionKey, question }) {
  if (normalize(generatedTopic) === normalize(expectedTopic)) {
    return true;
  }

  // This is deliberately narrow: only an expected Math Modeling item may accept a
  // nearby generated label when the item itself is a real-world rate/work model.
  return (
    sectionKey === "math" &&
    normalize(expectedTopic) === "modeling" &&
    new Set([
      "algebra",
      "functions",
      "number & quantity",
      "integrating essential skills",
      "modeling and applications",
      "rates and work",
    ]).has(normalize(generatedTopic)) &&
    isRateOrWorkModelingQuestion(question)
  );
}
