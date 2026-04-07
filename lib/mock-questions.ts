type SectionKey = "english" | "math" | "reading" | "science";

export type PracticeQuestion = {
  id: string;
  section: SectionKey;
  topic: string;
  difficulty: string;
  question_text: string;
  choices: { A: string; B: string; C: string; D: string };
  correct_answer: "A" | "B" | "C" | "D";
  explanation: string;
};

function englishQuestion(topic: string, index: number): PracticeQuestion {
  return {
    id: `mock-english-${topic}-${index}`,
    section: "english",
    topic,
    difficulty: index % 2 === 0 ? "medium" : "easy",
    question_text: `In the sentence below, choose the best revision for the underlined portion.\n\nThe student team, after practicing for weeks, _was prepared not only to compete but also winning with confidence._`,
    choices: {
      A: "was prepared not only to compete but also winning with confidence.",
      B: "was prepared not only to compete but also to win with confidence.",
      C: "was prepared to compete, and also winning with confidence.",
      D: "was prepared not only for competing but also winning with confidence.",
    },
    correct_answer: "B",
    explanation: `${topic} often tests parallel structure. Choice B keeps the pair balanced with "to compete" and "to win."`,
  };
}

function mathQuestion(topic: string, index: number): PracticeQuestion {
  const base = 6 + index;
  return {
    id: `mock-math-${topic}-${index}`,
    section: "math",
    topic,
    difficulty: index % 2 === 0 ? "medium" : "hard",
    question_text: `A rectangle has length ${base + 5} and width ${base - 1}. What is its area?`,
    choices: {
      A: `${(base + 5) + (base - 1)}`,
      B: `${(base + 5) * (base - 1)}`,
      C: `${(base + 5) * 2 + (base - 1) * 2}`,
      D: `${(base + 5) - (base - 1)}`,
    },
    correct_answer: "B",
    explanation: `${topic} questions often ask you to match the correct formula to the situation. Area of a rectangle is length times width.`,
  };
}

function readingQuestion(topic: string, index: number): PracticeQuestion {
  return {
    id: `mock-reading-${topic}-${index}`,
    section: "reading",
    topic,
    difficulty: index % 2 === 0 ? "medium" : "easy",
    question_text: `Passage excerpt:\n\nMira had always believed that the observatory was silent at dawn, but on her first morning there she heard the building hum with quiet preparation.\n\nWhich choice best describes the purpose of the second sentence?`,
    choices: {
      A: "It contradicts the narrator's earlier description by proving the observatory was closed.",
      B: "It develops the contrast between Mira's expectation and what she actually experiences.",
      C: "It shifts the passage away from Mira and toward the town's history.",
      D: "It explains why Mira leaves the observatory immediately.",
    },
    correct_answer: "B",
    explanation: `${topic} reading questions often test contrast and purpose. The sentence shows the difference between expectation and reality.`,
  };
}

function scienceQuestion(topic: string, index: number): PracticeQuestion {
  return {
    id: `mock-science-${topic}-${index}`,
    section: "science",
    topic,
    difficulty: index % 2 === 0 ? "medium" : "easy",
    question_text: `A student measured plant growth under four light conditions. Plants under blue light grew 12 cm, red light 9 cm, green light 6 cm, and no light 2 cm.\n\nBased on the data, which condition produced the greatest growth?`,
    choices: {
      A: "No light",
      B: "Green light",
      C: "Red light",
      D: "Blue light",
    },
    correct_answer: "D",
    explanation: `${topic} science questions usually reward careful reading of the data. Blue light has the highest measured growth at 12 cm.`,
  };
}

function buildQuestion(section: SectionKey, topic: string, index: number) {
  switch (section) {
    case "english":
      return englishQuestion(topic, index);
    case "math":
      return mathQuestion(topic, index);
    case "reading":
      return readingQuestion(topic, index);
    case "science":
      return scienceQuestion(topic, index);
  }
}

export function buildMockQuestions(
  section: SectionKey,
  topic: string,
  limit = 10,
  preferredDifficulty = "easy"
): PracticeQuestion[] {
  const safeTopic = topic || "Core Skills";
  const safeLimit = Math.min(Math.max(limit, 1), 10);

  return Array.from({ length: safeLimit }, (_, index) => ({
    ...buildQuestion(section, safeTopic, index + 1),
    difficulty: preferredDifficulty,
  }));
}
