export type DifficultyKey = "easy" | "medium" | "hard";
export type DifficultyCounts = Record<DifficultyKey, number>;

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
