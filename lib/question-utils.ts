import type { ChoiceMap } from "@/db/schema";

export type NormalizedQuestionRow = {
  id: string;
  section: string;
  topic: string;
  difficulty: string;
  passage: string | null;
  question_text: string;
  choices: ChoiceMap;
  correct_answer: keyof ChoiceMap;
  explanation: string;
};

export type QuestionQualityFlag = {
  severity: "reject" | "warn";
  code: string;
  message: string;
};

export type QuestionQualityReview = {
  shouldServe: boolean;
  riskScore: number;
  blockingFlags: QuestionQualityFlag[];
  warningFlags: QuestionQualityFlag[];
};

export function normalizeCorrectAnswer(answer: string): keyof ChoiceMap | null {
  const normalized = answer.trim().toUpperCase();
  return ["A", "B", "C", "D"].includes(normalized) ? (normalized as keyof ChoiceMap) : null;
}

function parseNumericEquivalent(value: string) {
  const normalized = value.replace(/,/g, "").replace(/\s+/g, "").trim();

  if (!normalized) {
    return null;
  }

  if (/^-?\d+\/-?\d+$/.test(normalized)) {
    const [numerator, denominator] = normalized.split("/").map(Number);

    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
      return null;
    }

    return numerator / denominator;
  }

  if (/^-?\d*\.?\d+%$/.test(normalized)) {
    const numeric = Number(normalized.slice(0, -1));
    return Number.isFinite(numeric) ? numeric / 100 : null;
  }

  if (/^-?\d*\.?\d+$/.test(normalized)) {
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
}

export function normalizeChoiceForComparison(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.,;:!?]+$/g, "")
    .replace(/\s+/g, " ");
}

export function areEquivalentChoices(left: string, right: string) {
  const normalizedLeft = normalizeChoiceForComparison(left);
  const normalizedRight = normalizeChoiceForComparison(right);

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  const numericLeft = parseNumericEquivalent(normalizedLeft);
  const numericRight = parseNumericEquivalent(normalizedRight);

  if (numericLeft === null || numericRight === null) {
    return false;
  }

  return Math.abs(numericLeft - numericRight) < 1e-9;
}

export function normalizeChoices(choices: unknown): ChoiceMap | null {
  if (!choices || typeof choices !== "object") {
    return null;
  }

  const normalized = {} as ChoiceMap;

  for (const choice of ["A", "B", "C", "D"] as const) {
    const value = (choices as Record<string, unknown>)[choice];

    if (typeof value !== "string" || value.trim().length === 0) {
      return null;
    }

    normalized[choice] = value.trim();
  }

  return normalized;
}

export function hasUnderlineMarkup(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return /\[underline\].*?\[\/underline\]|__(.*?)__|<u>.*?<\/u>/i.test(value);
}

function countWords(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function pushFlag(
  flags: QuestionQualityFlag[],
  severity: "reject" | "warn",
  code: string,
  message: string
) {
  flags.push({ severity, code, message });
}

export function reviewQuestionQuality(row: {
  id: string;
  section: string;
  topic: string;
  difficulty: string;
  passage: string | null;
  question_text: string;
  choices: unknown;
  correct_answer: string;
  explanation: string;
}): QuestionQualityReview {
  const flags: QuestionQualityFlag[] = [];
  const correctAnswer = normalizeCorrectAnswer(row.correct_answer);
  const choices = normalizeChoices(row.choices);

  if (!correctAnswer || !choices || !choices[correctAnswer]) {
    pushFlag(flags, "reject", "invalid-answer-map", "Correct answer mapping is invalid or incomplete.");
  }

  if (choices) {
    const choiceValues = (["A", "B", "C", "D"] as const).map((choice) => choices[choice]);

    for (let index = 0; index < choiceValues.length; index += 1) {
      for (let innerIndex = index + 1; innerIndex < choiceValues.length; innerIndex += 1) {
        if (areEquivalentChoices(choiceValues[index], choiceValues[innerIndex])) {
          pushFlag(
            flags,
            "reject",
            "equivalent-choices",
            "Two answer choices collapse to the same value or meaning."
          );
        }
      }
    }
  }

  const combinedText = `${row.question_text} ${row.passage ?? ""}`.toLowerCase();
  const normalizedDifficulty = row.difficulty.trim().toLowerCase();
  const promptWordCount = countWords(row.question_text);
  const passageWordCount = countWords(row.passage);
  const explanationWordCount = countWords(row.explanation);
  const allNumericChoices =
    choices !== null &&
    Object.values(choices).every((choice) => /^-?\d+(\.\d+)?$/.test(choice.trim()));
  const isMediumHard = normalizedDifficulty === "medium" || normalizedDifficulty === "hard";

  if (row.section === "english" && (!row.passage || row.passage.trim().length === 0)) {
    pushFlag(flags, "reject", "english-no-passage", "English revision question is missing passage context.");
  }

  if (row.section === "reading" && (!row.passage || row.passage.trim().length === 0)) {
    pushFlag(flags, "reject", "reading-no-passage", "Reading question is missing passage text.");
  }

  if (row.section === "science" && (!row.passage || row.passage.trim().length === 0)) {
    pushFlag(flags, "reject", "science-no-setup", "Science question is missing experiment or data setup.");
  }

  if (
    row.section === "english" &&
    /\b(identify|what is the function|which punctuation mark|what is the subject|define|part of speech|best synonym)\b/.test(
      combinedText
    )
  ) {
    pushFlag(
      flags,
      "reject",
      "english-terminology-quiz",
      "English item reads like terminology recall instead of ACT revision in context."
    );
  }

  if (
    combinedText.includes("underlin") &&
    !hasUnderlineMarkup(row.question_text) &&
    !hasUnderlineMarkup(row.passage)
  ) {
    pushFlag(
      flags,
      "reject",
      "missing-underline-markup",
      "Question refers to underlined text without marking it in the prompt or passage."
    );
  }

  if (
    row.section === "math" &&
    normalizedDifficulty !== "easy" &&
    (
      /a rectangle has length .* what is its area\?/i.test(row.question_text) ||
      /what is the slope of the line passing through/i.test(row.question_text) ||
      /^solve for x:\s*[-\d+x\s=+]+$/i.test(row.question_text) ||
      (row.question_text.trim().length < 85 && allNumericChoices)
    )
  ) {
    pushFlag(
      flags,
      "reject",
      "soft-math-stem",
      "Math item looks too direct or too clean to deserve a medium or hard label."
    );
  }

  if (isMediumHard && explanationWordCount < 16) {
    pushFlag(
      flags,
      "warn",
      "thin-explanation",
      "Explanation is thin for a medium or hard question and may not show real reasoning depth."
    );
  }

  if (row.section === "english" && isMediumHard) {
    if (passageWordCount < 35) {
      pushFlag(
        flags,
        "warn",
        "thin-english-context",
        "English passage context is short enough that the revision may feel too isolated."
      );
    }

    if (promptWordCount < 9) {
      pushFlag(
        flags,
        "warn",
        "thin-english-stem",
        "English prompt is very short for a medium or hard revision decision."
      );
    }
  }

  if (row.section === "math" && isMediumHard) {
    if (promptWordCount < 14 && !row.passage) {
      pushFlag(
        flags,
        "warn",
        "short-math-stem",
        "Math stem is unusually short for a medium or hard ACT item."
      );
    }

    if (allNumericChoices && promptWordCount < 18) {
      pushFlag(
        flags,
        "warn",
        "clean-numeric-choices",
        "All-numeric choices plus a short stem often signals a soft math item."
      );
    }

    if (/^(solve|what is the value of x|what is x)/i.test(row.question_text.trim())) {
      pushFlag(
        flags,
        "warn",
        "direct-math-ask",
        "Stem opens like a direct classroom drill instead of a fuller ACT setup."
      );
    }
  }

  if (row.section === "reading" && isMediumHard) {
    if (passageWordCount < 55) {
      pushFlag(
        flags,
        "warn",
        "short-reading-passage",
        "Reading passage is short enough that the question may not create real passage pressure."
      );
    }

    if (promptWordCount < 10) {
      pushFlag(
        flags,
        "warn",
        "short-reading-stem",
        "Reading stem is very short for a medium or hard discrimination task."
      );
    }

    if (
      !/\b(infer|imply|suggest|tone|attitude|purpose|primarily|main|best supports|evidence|organization|meaning|context)\b/i.test(
        row.question_text
      )
    ) {
      pushFlag(
        flags,
        "warn",
        "low-demand-reading-ask",
        "Reading stem may be too generic to reliably feel like true ACT medium or hard difficulty."
      );
    }
  }

  if (row.section === "science" && isMediumHard) {
    if (passageWordCount < 45) {
      pushFlag(
        flags,
        "warn",
        "thin-science-setup",
        "Science setup is short for a medium or hard data or experiment question."
      );
    }

    if (
      !/\b(experiment|study|figure|table|graph|trial|sample|temperature|rate|scientist|researcher|viewpoint|results)\b/i.test(
        combinedText
      )
    ) {
      pushFlag(
        flags,
        "warn",
        "weak-science-signal",
        "Science wording lacks the data or experiment signal expected from stronger ACT-style items."
      );
    }
  }

  const blockingFlags = flags.filter((flag) => flag.severity === "reject");
  const warningFlags = flags.filter((flag) => flag.severity === "warn");
  const riskScore =
    blockingFlags.length * 3 +
    warningFlags.length +
    (isMediumHard ? 1 : 0);
  const shouldServe =
    blockingFlags.length === 0 &&
    !(isMediumHard && warningFlags.length >= 2);

  return {
    shouldServe,
    riskScore,
    blockingFlags,
    warningFlags,
  };
}

export function normalizeQuestionRow(row: {
  id: string;
  section: string;
  topic: string;
  difficulty: string;
  passage: string | null;
  question_text: string;
  choices: unknown;
  correct_answer: string;
  explanation: string;
}) {
  const qualityReview = reviewQuestionQuality(row);
  const correctAnswer = normalizeCorrectAnswer(row.correct_answer);
  const choices = normalizeChoices(row.choices);

  if (!qualityReview.shouldServe || !correctAnswer || !choices || !choices[correctAnswer]) {
    return null;
  }

  return {
    id: row.id,
    section: row.section,
    topic: row.topic,
    difficulty: row.difficulty,
    passage: row.passage,
    question_text: row.question_text,
    choices,
    correct_answer: correctAnswer,
    explanation: row.explanation,
  } satisfies NormalizedQuestionRow;
}
