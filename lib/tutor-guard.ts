export type TutorAction = "message" | "hint" | "show_answer";
export type TutorPhase = "general" | "hint" | "reveal" | "review" | "choice_check";

export type TutorTurnDecision = {
  phase: TutorPhase;
  nextHintLevel: 0 | 1 | 2 | 3;
  incrementHintCount: boolean;
  revealAnswer: boolean;
  answerRequestBlocked: boolean;
};

const ANSWER_REQUEST_PATTERNS = [
  /\bwhat(?:'s| is) the answer\b/i,
  /\bjust tell me\b/i,
  /\btell me the answer\b/i,
  /\bshow (?:me )?(?:the )?answer\b/i,
  /\bgive me the answer\b/i,
  /\breveal (?:the )?answer\b/i,
];

const HINT_REQUEST_PATTERNS = [
  /\bhint\b/i,
  /\bclue\b/i,
  /\bnudge\b/i,
  /\bhelp me (?:start|think|figure)/i,
];

const CHOICE_CHECK_PATTERNS = [
  /\bis it\s+[abcd]\b/i,
  /\bi think (?:it(?:'s| is)\s+)?[abcd]\b/i,
  /\b(?:choice|option)\s+[abcd]\s*(?:\?|$)/i,
  /\b[abcd]\s*(?:is|seems|looks)\s+(?:right|correct|best)\b/i,
];

export function decideTutorTurn({
  message,
  action = "message",
  submitted,
  hintLevel,
}: {
  message: string;
  action?: TutorAction;
  submitted: boolean;
  hintLevel: number;
}): TutorTurnDecision {
  if (submitted) {
    return {
      phase: "review",
      nextHintLevel: Math.max(0, Math.min(3, hintLevel)) as 0 | 1 | 2 | 3,
      incrementHintCount: false,
      revealAnswer: false,
      answerRequestBlocked: false,
    };
  }

  if (action === "hint" || HINT_REQUEST_PATTERNS.some((pattern) => pattern.test(message))) {
    if (hintLevel >= 3) {
      return {
        phase: "hint",
        nextHintLevel: 3,
        incrementHintCount: false,
        revealAnswer: false,
        answerRequestBlocked: false,
      };
    }

    return {
      phase: "hint",
      nextHintLevel: Math.min(3, Math.max(1, hintLevel + 1)) as 1 | 2 | 3,
      incrementHintCount: true,
      revealAnswer: false,
      answerRequestBlocked: false,
    };
  }

  if (CHOICE_CHECK_PATTERNS.some((pattern) => pattern.test(message))) {
    return {
      phase: "choice_check",
      nextHintLevel: Math.min(3, Math.max(0, hintLevel)) as 0 | 1 | 2 | 3,
      incrementHintCount: false,
      revealAnswer: false,
      answerRequestBlocked: false,
    };
  }

  const wantsAnswer =
    action === "show_answer" ||
    ANSWER_REQUEST_PATTERNS.some((pattern) => pattern.test(message));

  if (wantsAnswer) {
    if (hintLevel >= 1) {
      return {
        phase: "reveal",
        nextHintLevel: Math.max(1, Math.min(3, hintLevel)) as 1 | 2 | 3,
        incrementHintCount: false,
        revealAnswer: true,
        answerRequestBlocked: false,
      };
    }

    return {
      phase: "general",
      nextHintLevel: 0,
      incrementHintCount: false,
      revealAnswer: false,
      answerRequestBlocked: true,
    };
  }

  return {
    phase: "general",
    nextHintLevel: Math.max(0, Math.min(3, hintLevel)) as 0 | 1 | 2 | 3,
    incrementHintCount: false,
    revealAnswer: false,
    answerRequestBlocked: false,
  };
}

function normalizeForLeakCheck(value: string) {
  return value
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsExplanationChunk(reply: string, explanation: string) {
  const normalizedReply = normalizeForLeakCheck(reply);
  const words = normalizeForLeakCheck(explanation).split(" ").filter(Boolean);
  if (words.length < 8) {
    return words.length > 0 && normalizedReply.includes(words.join(" "));
  }

  const chunkSize = Math.min(10, words.length);
  for (let index = 0; index <= words.length - chunkSize; index += 1) {
    const chunk = words.slice(index, index + chunkSize).join(" ");
    if (chunk.length >= 36 && normalizedReply.includes(chunk)) {
      return true;
    }
  }
  return false;
}

export function looksIncompleteTutorReply(reply: string) {
  const raw = reply.trim();
  if (!raw || /,\s*[.!?]$/.test(raw)) return true;

  const cleaned = raw.replace(/[.!?]+$/, "").trim().toLowerCase();
  return /\b(?:a|an|the|to|of|for|with|between|before|after|and|or|because|that|which|what|how|like|this|whether|who|when|where|why|if|as|from|into|about|through|by|at|in|on|is|are|was|were|be|being|been|have|has|had|do|does|did|can|could|would|should|may|might|must|identify|independent|real|here)$/i.test(
    cleaned
  );
}

export function detectTutorLeak({
  reply,
  correctAnswer,
  correctChoiceText,
  explanation,
  choices,
}: {
  reply: string;
  correctAnswer: string;
  correctChoiceText: string;
  explanation: string;
  choices?: Record<string, string>;
}) {
  const letter = correctAnswer.toUpperCase().replace(/[^A-D]/g, "");
  const answerPatterns = [
    new RegExp(`\\b(?:the\\s+)?(?:answer|choice|option)\\s*(?:is|=|:|-)?\\s*${letter}\\b`, "i"),
    new RegExp(`\\b${letter}\\s+(?:is|would be|looks)\\s+(?:correct|right|best)\\b`, "i"),
    new RegExp(`\\b(?:correct|right|best)\\s+(?:answer|choice|option)\\s*(?:is|=|:|-)?\\s*${letter}\\b`, "i"),
  ];

  if (letter && answerPatterns.some((pattern) => pattern.test(reply))) {
    return "correct-letter";
  }

  const normalizedChoice = normalizeForLeakCheck(correctChoiceText);
  const normalizedReply = normalizeForLeakCheck(reply);
  if (normalizedChoice.length >= 12 && normalizedReply.includes(normalizedChoice)) {
    return "correct-choice-text";
  }

  if (explanation && containsExplanationChunk(reply, explanation)) {
    return "canonical-explanation";
  }

  if (choices) {
    const eliminated = new Set<string>();
    for (const choiceLetter of Object.keys(choices)) {
      const eliminationPatterns = [
        new RegExp(`\\b(?:eliminate|rule out|cross out|discard)\\s+(?:choice\\s+|option\\s+)?${choiceLetter}\\b`, "i"),
        new RegExp(`\\b(?:choice\\s+|option\\s+)?${choiceLetter}\\s+(?:is|looks|seems)\\s+(?:wrong|incorrect|not right)\\b`, "i"),
        new RegExp(`\\b${choiceLetter}\\s+(?:doesn't|does not|cannot|can't)\\s+(?:work|fit|match|apply)\\b`, "i"),
      ];
      if (eliminationPatterns.some((pattern) => pattern.test(reply))) {
        eliminated.add(choiceLetter.toUpperCase());
      }
    }

    const incorrectLetters = Object.keys(choices)
      .map((letter) => letter.toUpperCase())
      .filter((letter) => letter !== correctAnswer.toUpperCase());
    const allIncorrectEliminated =
      incorrectLetters.length > 0 && incorrectLetters.every((letter) => eliminated.has(letter));
    if (allIncorrectEliminated) {
      return "all-wrong-choices-eliminated";
    }
  }

  return null;
}

export function guardPreSubmissionTutorReply(args: {
  reply: string;
  correctAnswer: string;
  correctChoiceText: string;
  explanation: string;
  choices?: Record<string, string>;
}) {
  const reason = detectTutorLeak(args);
  return {
    blocked: Boolean(reason),
    reason,
  };
}

export function buildSafePreSubmissionReply({
  section,
  topic,
  phase,
  requestedAnswerWithoutHint = false,
  hintLevel = 1,
}: {
  section: string;
  topic?: string;
  phase: "general" | "hint" | "choice_check";
  requestedAnswerWithoutHint?: boolean;
  hintLevel?: number;
}) {
  if (phase === "choice_check") {
    return "Tell me what makes that choice fit the question. If you're ready to check it, submit your answer.";
  }

  if (requestedAnswerWithoutHint) {
    return "I won't give it away yet. Ask for a hint first, and I'll point you toward the key idea.";
  }

  const focus = topic ? ` this ${topic} question` : " this question";

  if (phase === "hint") {
    const normalizedTopic = (topic || "").toLowerCase();
    const level = Math.max(1, Math.min(3, hintLevel));

    if (level === 2) {
      if (section === "math") {
        return `Hint 2: look at the exact condition or equation in${focus} and identify which term directly controls the quantity being asked for.`;
      }
      if (section === "reading") {
        return `Hint 2: find the exact sentence in${focus} that answers the question most directly, and ignore ideas the passage never states.`;
      }
      if (section === "science") {
        return `Hint 2: focus on the exact row, axis, or experimental condition in${focus} that matches the question before comparing values.`;
      }
      return `Hint 2: focus on the exact words immediately around the underlined part in${focus}; decide what grammatical job each side is doing.`;
    }

    if (level >= 3) {
      if (section === "math") {
        return `Hint 3: write the first equation or relationship for${focus} and simplify just that first step before checking the choices.`;
      }
      if (section === "reading") {
        return `Hint 3: paraphrase the relevant sentence from${focus} in your own words first; then compare that meaning with the choices.`;
      }
      if (section === "science") {
        return `Hint 3: state the trend or comparison from${focus} in one sentence before you look at the answer choices.`;
      }
      return `Hint 3: test the sentence structure in${focus} with the simplest version of the rule first, then compare the choices.`;
    }

    if (section === "math") {
      if (normalizedTopic.includes("algebra")) {
        return "Here's a hint: translate the condition into an equation first, then simplify symbolically before plugging in numbers.";
      }
      if (normalizedTopic.includes("function")) {
        return "Here's a hint: identify the input-output relationship first, then track exactly what the function rule does to the value.";
      }
      if (normalizedTopic.includes("geometry")) {
        return "Here's a hint: mark the known lengths or angles, then choose the geometry rule that directly connects them to what you need.";
      }
      return `Here's a hint: identify the exact quantity you're solving for in${focus}, then write the relationship before doing any arithmetic.`;
    }

    if (section === "reading") {
      return `Here's a hint: go back to the exact sentence or detail${focus} points to, and choose only what that evidence directly supports.`;
    }

    if (section === "science") {
      return `Here's a hint: identify the variables and the direction of the trend in${focus} before comparing it with the choices.`;
    }

    if (normalizedTopic.includes("punctuation")) {
      return "Here's a hint: check whether the words on each side can stand alone as complete sentences; that tells you which punctuation marks are even possible.";
    }
    if (normalizedTopic.includes("transition") || normalizedTopic.includes("cohesion")) {
      return "Here's a hint: name the relationship between the two ideas first—contrast, cause, example, or continuation—then choose a transition that matches it.";
    }
    if (normalizedTopic.includes("grammar") || normalizedTopic.includes("usage")) {
      return "Here's a hint: identify the sentence's subject and main verb first, then check whether the underlined wording agrees with that structure.";
    }

    return `Here's a hint: name the grammar or organization rule${focus} is testing, then apply that rule consistently before choosing.`;
  }

  if (section === "math") {
    return "Start by naming what you know, what you need, and the relationship connecting them. Set it up before calculating.";
  }
  if (section === "reading") {
    return "Start with the passage evidence, not the choices. Find the line or idea the question is really asking about.";
  }
  if (section === "science") {
    return "Start by reading the axes, variables, or experiment setup. Decide what relationship the data actually supports.";
  }
  return "Start by identifying the exact grammar, punctuation, or organization rule being tested. Then compare each choice against that rule.";
}

export function isRepeatedTutorHint(reply: string, priorHints: string[]) {
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const normalizedReply = normalize(reply);
  if (!normalizedReply) return true;

  return priorHints.some((hint) => {
    const normalizedHint = normalize(hint);
    if (!normalizedHint) return false;
    if (normalizedHint === normalizedReply) return true;

    const replyWords = new Set(normalizedReply.split(" ").filter(Boolean));
    const hintWords = new Set(normalizedHint.split(" ").filter(Boolean));
    const intersection = [...replyWords].filter((word) => hintWords.has(word)).length;
    const union = new Set([...replyWords, ...hintWords]).size;
    return union > 0 && intersection / union >= 0.82;
  });
}

export function getEffectivePracticeCorrectness({
  selectedAnswer,
  correctAnswer,
  answerRevealedBeforeSubmit,
}: {
  selectedAnswer: string;
  correctAnswer: string;
  answerRevealedBeforeSubmit: boolean;
}) {
  return selectedAnswer === correctAnswer && !answerRevealedBeforeSubmit;
}

export function buildFallbackTutorReply({
  section,
  topic,
  phase,
  submitted,
  requestedAnswerWithoutHint = false,
  hintLevel = 1,
  correctAnswer,
  explanation,
}: {
  section: string;
  topic?: string;
  phase: TutorPhase;
  submitted: boolean;
  requestedAnswerWithoutHint?: boolean;
  hintLevel?: number;
  correctAnswer?: string;
  explanation?: string;
}) {
  if (submitted || phase === "review") {
    if (correctAnswer && explanation) {
      return `The answer is ${correctAnswer}. ${explanation}`;
    }
    return "Let's review it step by step from the rule or evidence the question is testing.";
  }

  if (phase === "reveal") {
    if (correctAnswer && explanation) {
      return `The answer is ${correctAnswer}. ${explanation}`;
    }
    return "I can reveal it once the answer details are available.";
  }

  return buildSafePreSubmissionReply({
    section,
    topic,
    phase: phase === "choice_check" ? "choice_check" : phase === "hint" ? "hint" : "general",
    requestedAnswerWithoutHint,
    hintLevel,
  });
}
