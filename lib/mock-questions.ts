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

type QuestionFactory = (topic: string, index: number, difficulty: string) => PracticeQuestion;

const englishFactories: QuestionFactory[] = [
  (topic, index, difficulty) => ({
    id: `mock-english-${topic}-${index}`,
    section: "english",
    topic,
    difficulty,
    question_text:
      "In the sentence below, choose the best revision for the underlined portion.\n\nThe student team, after practicing for weeks, _was prepared not only to compete but also winning with confidence._",
    choices: {
      A: "was prepared not only to compete but also winning with confidence.",
      B: "was prepared not only to compete but also to win with confidence.",
      C: "was prepared to compete, and also winning with confidence.",
      D: "was prepared not only for competing but also winning with confidence.",
    },
    correct_answer: "B",
    explanation: `${topic} often tests parallel structure. The pair after "not only ... but also ..." should match grammatically.`,
  }),
  (topic, index, difficulty) => ({
    id: `mock-english-${topic}-${index}`,
    section: "english",
    topic,
    difficulty,
    question_text:
      "Choose the best punctuation for the underlined portion.\n\nMaya packed everything she needed for the trip _a flashlight a map and a notebook._",
    choices: {
      A: "a flashlight a map and a notebook.",
      B: "a flashlight, a map and a notebook.",
      C: "a flashlight, a map, and a notebook.",
      D: "a flashlight; a map, and a notebook.",
    },
    correct_answer: "C",
    explanation: `${topic} often tests list punctuation. A clear series needs commas between all items, including before the final conjunction when using standard ACT conventions.`,
  }),
  (topic, index, difficulty) => ({
    id: `mock-english-${topic}-${index}`,
    section: "english",
    topic,
    difficulty,
    question_text:
      "Which choice best maintains the sentence's clarity and concision?\n\nBecause Jordan had already studied the chapter before class started, _therefore he felt prepared for the quiz._",
    choices: {
      A: "therefore he felt prepared for the quiz.",
      B: "he felt therefore prepared for the quiz.",
      C: "he felt prepared for the quiz.",
      D: "and therefore, he felt prepared for the quiz.",
    },
    correct_answer: "C",
    explanation: `${topic} rewards removing redundancy. "Because" already signals cause, so adding "therefore" makes the sentence wordy and awkward.`,
  }),
];

const mathFactories: QuestionFactory[] = [
  (topic, index, difficulty) => {
    const base = 5 + index;
    return {
      id: `mock-math-${topic}-${index}`,
      section: "math",
      topic,
      difficulty,
      question_text: `A rectangle has length ${base + 6} and width ${base - 1}. What is its area?`,
      choices: {
        A: `${(base + 6) + (base - 1)}`,
        B: `${(base + 6) * (base - 1)}`,
        C: `${(base + 6) * 2 + (base - 1) * 2}`,
        D: `${(base + 6) - (base - 1)}`,
      },
      correct_answer: "B",
      explanation: `${topic} questions often test formula selection. Area of a rectangle is length times width.`,
    };
  },
  (topic, index, difficulty) => {
    const x = index + 3;
    return {
      id: `mock-math-${topic}-${index}`,
      section: "math",
      topic,
      difficulty,
      question_text: `Solve for x: 3x + ${x} = ${4 * x + 6}`,
      choices: {
        A: "3",
        B: "6",
        C: "9",
        D: "12",
      },
      correct_answer: "B",
      explanation: `${topic} often tests one-variable equations. Subtract 3x from both sides to get ${x} = x + 6, then subtract ${x}.`,
    };
  },
  (topic, index, difficulty) => {
    const a = index + 2;
    const b = index + 5;
    return {
      id: `mock-math-${topic}-${index}`,
      section: "math",
      topic,
      difficulty,
      question_text: `What is the slope of the line passing through (${a}, ${b}) and (${a + 2}, ${b + 6})?`,
      choices: {
        A: "2",
        B: "3",
        C: "4",
        D: "6",
      },
      correct_answer: "B",
      explanation: `${topic} may test rate of change. Slope is rise over run: 6 divided by 2 equals 3.`,
    };
  },
];

const readingFactories: QuestionFactory[] = [
  (topic, index, difficulty) => ({
    id: `mock-reading-${topic}-${index}`,
    section: "reading",
    topic,
    difficulty,
    question_text:
      "Passage excerpt:\n\nMira had always believed that the observatory was silent at dawn, but on her first morning there she heard the building hum with quiet preparation.\n\nWhich choice best describes the purpose of the second sentence?",
    choices: {
      A: "It contradicts the narrator's earlier description by proving the observatory was closed.",
      B: "It develops the contrast between Mira's expectation and what she actually experiences.",
      C: "It shifts the passage away from Mira and toward the town's history.",
      D: "It explains why Mira leaves the observatory immediately.",
    },
    correct_answer: "B",
    explanation: `${topic} reading questions often test contrast and purpose. The sentence shows the difference between expectation and reality.`,
  }),
  (topic, index, difficulty) => ({
    id: `mock-reading-${topic}-${index}`,
    section: "reading",
    topic,
    difficulty,
    question_text:
      "Passage excerpt:\n\nThe coach did not argue when the storm canceled practice. Instead, she handed each player a notebook and asked them to record three moments from the season that had changed the way they thought about teamwork.\n\nThe passage suggests that the coach values:",
    choices: {
      A: "reflection as part of improvement.",
      B: "winning over cooperation.",
      C: "strict silence during difficult moments.",
      D: "canceling practice whenever conditions are poor.",
    },
    correct_answer: "A",
    explanation: `${topic} often asks you to infer values from actions. The notebook exercise shows the coach values reflection and learning.`,
  }),
  (topic, index, difficulty) => ({
    id: `mock-reading-${topic}-${index}`,
    section: "reading",
    topic,
    difficulty,
    question_text:
      "Passage excerpt:\n\nBy noon, the market was louder than Lina remembered, but it still moved in patterns she recognized: the fruit seller calling out prices, the tailor measuring hems, the baker sliding trays into the oven.\n\nThe list in the sentence mainly serves to:",
    choices: {
      A: "show that Lina is confused by her surroundings.",
      B: "create a sense of the market's familiar rhythm.",
      C: "prove that the market has changed completely.",
      D: "compare the market with a quiet classroom.",
    },
    correct_answer: "B",
    explanation: `${topic} can test the effect of details. The list builds a rhythmic, familiar atmosphere.`,
  }),
];

const scienceFactories: QuestionFactory[] = [
  (topic, index, difficulty) => ({
    id: `mock-science-${topic}-${index}`,
    section: "science",
    topic,
    difficulty,
    question_text:
      "A student measured plant growth under four light conditions. Plants under blue light grew 12 cm, red light 9 cm, green light 6 cm, and no light 2 cm.\n\nBased on the data, which condition produced the greatest growth?",
    choices: {
      A: "No light",
      B: "Green light",
      C: "Red light",
      D: "Blue light",
    },
    correct_answer: "D",
    explanation: `${topic} science questions reward careful reading of data tables and comparisons. Blue light shows the greatest growth.`,
  }),
  (topic, index, difficulty) => ({
    id: `mock-science-${topic}-${index}`,
    section: "science",
    topic,
    difficulty,
    question_text:
      "A graph shows that as the temperature of a gas sample increases from 10°C to 30°C, its volume rises from 20 mL to 28 mL.\n\nWhich statement is best supported by the graph?",
    choices: {
      A: "The gas volume decreased as temperature increased.",
      B: "The gas volume stayed constant across the temperatures tested.",
      C: "The gas volume increased as temperature increased.",
      D: "The graph proves the gas changed into a liquid.",
    },
    correct_answer: "C",
    explanation: `${topic} often asks for the most direct supported claim. The graph shows a positive relationship between temperature and volume.`,
  }),
  (topic, index, difficulty) => ({
    id: `mock-science-${topic}-${index}`,
    section: "science",
    topic,
    difficulty,
    question_text:
      "Researcher 1 claims a lake's fish population dropped because of pollution. Researcher 2 claims the drop happened mainly because an invasive species was introduced.\n\nThis setup is most similar to which ACT Science passage type?",
    choices: {
      A: "Data representation",
      B: "Conflicting viewpoints",
      C: "Experimental controls only",
      D: "Mathematical proof",
    },
    correct_answer: "B",
    explanation: `${topic} sometimes tests passage type recognition. Two researchers offering competing explanations matches conflicting viewpoints.`,
  }),
];

const sectionFactories: Record<SectionKey, QuestionFactory[]> = {
  english: englishFactories,
  math: mathFactories,
  reading: readingFactories,
  science: scienceFactories,
};

export function buildMockQuestions(
  section: SectionKey,
  topic: string,
  limit = 10,
  preferredDifficulty = "easy"
): PracticeQuestion[] {
  const safeTopic = topic || "Core Skills";
  const safeLimit = Math.min(Math.max(limit, 1), 10);
  const factories = sectionFactories[section];

  return Array.from({ length: safeLimit }, (_, index) => {
    const factory = factories[index % factories.length];
    return factory(safeTopic, index + 1, preferredDifficulty);
  });
}
