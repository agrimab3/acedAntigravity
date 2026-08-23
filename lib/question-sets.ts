import type { QuestionSetKind } from "@/db/schema";

export type QuestionSetSectionKey = "reading" | "science";

export type QuestionSetLinkValidationInput = {
  questionId: string;
  questionSectionKey: string;
  questionTopicId?: string | null;
  questionSetId?: string | null;
  questionSetSectionKey?: string | null;
  questionSetTopicId?: string | null;
};

export type QuestionSetLinkValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export type QuestionSetHydrationInput = QuestionSetLinkValidationInput & {
  passage?: string | null;
  questionSetKind?: string | null;
  questionSetTitle?: string | null;
  questionSetContent?: string | null;
};

export type QuestionSetHydrationResult = {
  effectivePassage: string | null;
  questionSet:
    | {
        id: string;
        kind: QuestionSetKind | null;
        title: string | null;
        content: string | null;
      }
    | null;
};

const QUESTION_SET_SECTIONS = new Set<QuestionSetSectionKey>(["reading", "science"]);

export function validateQuestionSetLink(
  input: QuestionSetLinkValidationInput
): QuestionSetLinkValidationResult {
  if (!input.questionSetId) {
    return { ok: true };
  }

  if (!input.questionSetSectionKey) {
    return { ok: false, reason: "missing-question-set-section" };
  }

  if (!QUESTION_SET_SECTIONS.has(input.questionSetSectionKey as QuestionSetSectionKey)) {
    return { ok: false, reason: "unsupported-question-set-section" };
  }

  if (input.questionSectionKey !== input.questionSetSectionKey) {
    return { ok: false, reason: "question-section-mismatch" };
  }

  if (
    input.questionTopicId &&
    input.questionSetTopicId &&
    input.questionTopicId !== input.questionSetTopicId
  ) {
    return { ok: false, reason: "question-topic-mismatch" };
  }

  return { ok: true };
}

export function resolveEffectivePassage({
  passage,
  questionSetContent,
}: Pick<QuestionSetHydrationInput, "passage" | "questionSetContent">) {
  return passage ?? questionSetContent ?? null;
}

export function hydrateQuestionSetContext(
  input: QuestionSetHydrationInput
): QuestionSetHydrationResult {
  const validation = validateQuestionSetLink(input);

  if (!validation.ok) {
    return {
      effectivePassage: input.passage ?? null,
      questionSet: null,
    };
  }

  return {
    effectivePassage: resolveEffectivePassage(input),
    questionSet: input.questionSetId
      ? {
          id: input.questionSetId,
          kind: (input.questionSetKind as QuestionSetKind | null | undefined) ?? null,
          title: input.questionSetTitle ?? null,
          content: input.questionSetContent ?? null,
        }
      : null,
  };
}
