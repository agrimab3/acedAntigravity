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

export function normalizeCorrectAnswer(answer: string): keyof ChoiceMap | null {
  const normalized = answer.trim().toUpperCase();
  return ["A", "B", "C", "D"].includes(normalized) ? (normalized as keyof ChoiceMap) : null;
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
  const correctAnswer = normalizeCorrectAnswer(row.correct_answer);
  const choices = normalizeChoices(row.choices);

  if (!correctAnswer || !choices || !choices[correctAnswer]) {
    return null;
  }

  const combinedText = `${row.question_text} ${row.passage ?? ""}`.toLowerCase();

  if (row.section === "english" && (!row.passage || row.passage.trim().length === 0)) {
    return null;
  }

  if (
    row.section === "english" &&
    /\b(identify|what is the function|which punctuation mark|what is the subject|define|part of speech|best synonym)\b/.test(
      combinedText
    )
  ) {
    return null;
  }

  if (combinedText.includes("underlin") && !hasUnderlineMarkup(row.question_text) && !hasUnderlineMarkup(row.passage)) {
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
