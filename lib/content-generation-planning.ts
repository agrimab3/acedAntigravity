export type DifficultyKey = "easy" | "medium" | "hard";
export type DifficultyCounts = Record<DifficultyKey, number>;
export type DifficultyAssessment = "accurate" | "too_easy" | "too_hard" | "unclear";
export type ChildDisposition = "accept" | "revise" | "reject" | "replace";

const PLANNING_DIFFICULTY_ORDER: DifficultyKey[] = ["hard", "medium", "easy"];
const PROMPT_DIFFICULTY_ORDER: DifficultyKey[] = ["easy", "medium", "hard"];

export function buildRequestedDifficultySequence(
  requestedCounts: DifficultyCounts,
  order: DifficultyKey[] = PLANNING_DIFFICULTY_ORDER
) {
  const sequence: DifficultyKey[] = [];
  const remaining = {
    easy: requestedCounts.easy,
    medium: requestedCounts.medium,
    hard: requestedCounts.hard,
  };

  while (remaining.easy > 0 || remaining.medium > 0 || remaining.hard > 0) {
    for (const difficulty of order) {
      if (remaining[difficulty] > 0) {
        sequence.push(difficulty);
        remaining[difficulty] -= 1;
      }
    }
  }

  return sequence;
}

export function planQuestionSetDifficultyCounts(
  sectionKey: string,
  requestedCounts: DifficultyCounts,
  preferredChildCount = 6
) {
  const totalRequested = PROMPT_DIFFICULTY_ORDER.reduce(
    (sum, difficulty) => sum + requestedCounts[difficulty],
    0
  );
  const sectionPreferredChildCount = sectionKey === "reading" || sectionKey === "science"
    ? preferredChildCount
    : totalRequested;
  const setCount = Math.max(1, Math.ceil(totalRequested / sectionPreferredChildCount));
  const baseSize = Math.floor(totalRequested / setCount);
  const remainder = totalRequested % setCount;
  const setSizes = Array.from({ length: setCount }, (_, index) => baseSize + (index < remainder ? 1 : 0));
  const difficultySequence = buildRequestedDifficultySequence(requestedCounts);

  let cursor = 0;
  return setSizes.map((setSize) => {
    const slice = difficultySequence.slice(cursor, cursor + setSize);
    cursor += setSize;
    return {
      easy: slice.filter((difficulty) => difficulty === "easy").length,
      medium: slice.filter((difficulty) => difficulty === "medium").length,
      hard: slice.filter((difficulty) => difficulty === "hard").length,
    } satisfies DifficultyCounts;
  });
}

export function buildPromptDifficultyBlueprint(requestedCounts: DifficultyCounts) {
  return buildRequestedDifficultySequence(requestedCounts, PROMPT_DIFFICULTY_ORDER);
}

export function countDifficulties(difficulties: DifficultyKey[]) {
  return difficulties.reduce(
    (counts, difficulty) => {
      counts[difficulty] += 1;
      return counts;
    },
    {
      easy: 0,
      medium: 0,
      hard: 0,
    } satisfies DifficultyCounts
  );
}

export function buildMissingDifficultySequence(
  requestedCounts: DifficultyCounts,
  approvedDifficulties: DifficultyKey[]
) {
  const approvedCounts = countDifficulties(approvedDifficulties);
  const missingCounts = {
    easy: Math.max(0, requestedCounts.easy - approvedCounts.easy),
    medium: Math.max(0, requestedCounts.medium - approvedCounts.medium),
    hard: Math.max(0, requestedCounts.hard - approvedCounts.hard),
  } satisfies DifficultyCounts;

  return buildRequestedDifficultySequence(missingCounts, PROMPT_DIFFICULTY_ORDER);
}

export function shouldReviseForDifficulty({
  requestedDifficulty,
  generatedDifficulty,
  difficultyAccuracy,
  suggestedDifficulty,
}: {
  requestedDifficulty: DifficultyKey;
  generatedDifficulty: DifficultyKey;
  difficultyAccuracy: DifficultyAssessment;
  suggestedDifficulty: DifficultyKey | null;
}) {
  if (difficultyAccuracy === "too_easy" || difficultyAccuracy === "too_hard") {
    return true;
  }

  if (
    suggestedDifficulty !== null &&
    suggestedDifficulty !== requestedDifficulty
  ) {
    return true;
  }

  if (generatedDifficulty !== requestedDifficulty) {
    return true;
  }

  return false;
}

export function formatDifficultyReviewerAssessment({
  difficultyAccuracy,
  suggestedDifficulty,
}: {
  difficultyAccuracy: DifficultyAssessment;
  suggestedDifficulty: DifficultyKey | null;
}) {
  return difficultyAccuracy === "accurate"
    ? "accurate"
    : suggestedDifficulty
      ? `${difficultyAccuracy}->${suggestedDifficulty}`
      : difficultyAccuracy;
}

type CanonicalChildShape = {
  section: string;
  topic: string;
  difficulty: DifficultyKey;
  question_text: string;
  choices: Record<"A" | "B" | "C" | "D", string>;
  correct_answer: "A" | "B" | "C" | "D";
  explanation: string;
};

type QuestionLikeObject = Partial<CanonicalChildShape> & Record<string, unknown>;

export function mergeRevisedChildShape({
  originalChild,
  revisedFields,
  requestedDifficulty,
  section,
  topic,
}: {
  originalChild: CanonicalChildShape;
  revisedFields: Partial<CanonicalChildShape> | null | undefined;
  requestedDifficulty: DifficultyKey;
  section: string;
  topic: string;
}) {
  return {
    section,
    topic,
    difficulty: requestedDifficulty,
    question_text: revisedFields?.question_text ?? originalChild.question_text,
    choices: revisedFields?.choices ?? originalChild.choices,
    correct_answer: revisedFields?.correct_answer ?? originalChild.correct_answer,
    explanation: revisedFields?.explanation ?? originalChild.explanation,
  } satisfies CanonicalChildShape;
}

export function decideChildDisposition({
  reviewerVerdict,
  requestedDifficulty,
  generatedDifficulty,
  difficultyAccuracy,
  suggestedDifficulty,
  hasHardFailure,
}: {
  reviewerVerdict: "keep" | "revise" | "reject";
  requestedDifficulty: DifficultyKey;
  generatedDifficulty: DifficultyKey;
  difficultyAccuracy: DifficultyAssessment;
  suggestedDifficulty: DifficultyKey | null;
  hasHardFailure: boolean;
}): ChildDisposition {
  if (hasHardFailure || reviewerVerdict === "reject") {
    return "reject";
  }

  if (
    shouldReviseForDifficulty({
      requestedDifficulty,
      generatedDifficulty,
      difficultyAccuracy,
      suggestedDifficulty,
    })
  ) {
    return "revise";
  }

  if (
    reviewerVerdict === "keep" &&
    (suggestedDifficulty === null || suggestedDifficulty === requestedDifficulty)
  ) {
    return "accept";
  }

  return "reject";
}

export function toCanonicalChild(
  candidate: unknown,
  {
    originalChild,
    section,
    topic,
    requestedDifficulty,
  }: {
    originalChild?: CanonicalChildShape | null;
    section: string;
    topic: string;
    requestedDifficulty: DifficultyKey;
  }
) {
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Candidate child is not an object.");
  }

  const candidateObject = candidate as Record<string, unknown>;
  const questionFieldKeys = [
    "section",
    "topic",
    "difficulty",
    "question_text",
    "choices",
    "correct_answer",
    "explanation",
  ] as const;
  const reviewMetadataKeys = [
    "verdict",
    "confidence",
    "correctness",
    "difficulty_accuracy",
    "suggested_difficulty",
    "editorial_note",
  ] as const;
  const hasQuestionFields = questionFieldKeys.some((key) => key in candidateObject);
  const hasReviewMetadata = reviewMetadataKeys.some((key) => key in candidateObject);

  if (!hasQuestionFields && hasReviewMetadata) {
    throw new Error("Candidate child looks like review metadata instead of question content.");
  }

  const merged = mergeRevisedChildShape({
    originalChild:
      originalChild ??
      ({
        section,
        topic,
        difficulty: requestedDifficulty,
      } as CanonicalChildShape),
    revisedFields: candidateObject as QuestionLikeObject,
    requestedDifficulty,
    section,
    topic,
  });

  const missingFields = questionFieldKeys.filter((key) => {
    if (key === "section" || key === "topic" || key === "difficulty") {
      return false;
    }

    const value = merged[key];

    if (key === "choices") {
      return (
        !value ||
        typeof value !== "object" ||
        !("A" in value) ||
        !("B" in value) ||
        !("C" in value) ||
        !("D" in value)
      );
    }

    return typeof value !== "string" || value.trim().length === 0;
  });

  if (missingFields.length > 0) {
    throw new Error(`Canonical child is missing required fields: ${missingFields.join(", ")}`);
  }

  return merged;
}
