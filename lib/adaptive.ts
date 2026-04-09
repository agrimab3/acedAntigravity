export const DIFFICULTY_BANDS = [
  "foundation",
  "easy",
  "medium",
  "hard",
  "challenge",
] as const;

export type DifficultyBand = (typeof DIFFICULTY_BANDS)[number];

export type AdaptiveFeedback = {
  direction: "up" | "down" | "steady";
  label: string;
  description: string;
};

type SkillSnapshot = {
  currentDifficulty?: string | null;
  recentAccuracyPct?: number | null;
  rollingAccuracyPct?: number | null;
  correctStreak?: number | null;
  incorrectStreak?: number | null;
  totalAnswered?: number | null;
};

function isDifficultyBand(value: string): value is DifficultyBand {
  return (DIFFICULTY_BANDS as readonly string[]).includes(value);
}

export function normalizeDifficultyBand(value?: string | null): DifficultyBand {
  if (value && isDifficultyBand(value)) {
    return value;
  }

  return "medium";
}

export function formatDifficultyBand(value?: string | null) {
  const normalized = normalizeDifficultyBand(value);

  switch (normalized) {
    case "foundation":
      return "foundation";
    case "easy":
      return "easy";
    case "medium":
      return "medium";
    case "hard":
      return "hard";
    case "challenge":
      return "challenge";
    default:
      return normalized;
  }
}

export function getDifficultySweep(target: DifficultyBand): DifficultyBand[] {
  switch (target) {
    case "foundation":
      return ["foundation", "easy", "medium", "hard", "challenge"];
    case "easy":
      return ["easy", "medium", "foundation", "hard", "challenge"];
    case "medium":
      return ["medium", "hard", "easy", "challenge", "foundation"];
    case "hard":
      return ["hard", "challenge", "medium", "easy", "foundation"];
    case "challenge":
      return ["challenge", "hard", "medium", "easy", "foundation"];
    default:
      return ["medium", "hard", "easy", "challenge", "foundation"];
  }
}

export function chooseDifficultyBand(snapshot?: SkillSnapshot | null): DifficultyBand {
  if (!snapshot || !snapshot.totalAnswered) {
    return "medium";
  }

  const current = normalizeDifficultyBand(snapshot.currentDifficulty);
  const currentIndex = DIFFICULTY_BANDS.indexOf(current);
  const recentAccuracy = snapshot.recentAccuracyPct ?? 0;
  const rollingAccuracy = snapshot.rollingAccuracyPct ?? 0;
  const correctStreak = snapshot.correctStreak ?? 0;
  const incorrectStreak = snapshot.incorrectStreak ?? 0;

  if (correctStreak >= 3 && recentAccuracy >= 80) {
    return DIFFICULTY_BANDS[Math.min(currentIndex + 1, DIFFICULTY_BANDS.length - 1)];
  }

  if (incorrectStreak >= 2 || recentAccuracy <= 40) {
    return DIFFICULTY_BANDS[Math.max(currentIndex - 1, 0)];
  }

  if (rollingAccuracy >= 85 && currentIndex < DIFFICULTY_BANDS.length - 1) {
    return DIFFICULTY_BANDS[currentIndex + 1];
  }

  if (rollingAccuracy <= 35 && currentIndex > 0) {
    return DIFFICULTY_BANDS[currentIndex - 1];
  }

  return current;
}

export function buildAdaptiveFeedback({
  previousDifficulty,
  nextDifficulty,
  recentAccuracyPct,
  rollingAccuracyPct,
  correctStreak,
  incorrectStreak,
  totalAnswered,
}: {
  previousDifficulty?: string | null;
  nextDifficulty?: string | null;
  recentAccuracyPct?: number | null;
  rollingAccuracyPct?: number | null;
  correctStreak?: number | null;
  incorrectStreak?: number | null;
  totalAnswered?: number | null;
}): AdaptiveFeedback {
  const previous = normalizeDifficultyBand(previousDifficulty);
  const next = normalizeDifficultyBand(nextDifficulty);
  const previousIndex = DIFFICULTY_BANDS.indexOf(previous);
  const nextIndex = DIFFICULTY_BANDS.indexOf(next);
  const recentAccuracy = recentAccuracyPct ?? 0;
  const rollingAccuracy = rollingAccuracyPct ?? 0;
  const answered = totalAnswered ?? 0;

  if (nextIndex > previousIndex) {
    return {
      direction: "up",
      label: "difficulty rising",
      description:
        recentAccuracy >= 80 || correctStreak
          ? `You're handling this well, so Aced is moving you toward ${formatDifficultyBand(next)} ACT questions.`
          : `Aced is nudging you toward ${formatDifficultyBand(next)} questions to keep you growing.`,
    };
  }

  if (nextIndex < previousIndex) {
    return {
      direction: "down",
      label: "rebuilding fundamentals",
      description:
        incorrectStreak && incorrectStreak >= 2
          ? `Aced is dialing the difficulty back to ${formatDifficultyBand(next)} so you can lock in the core skill first.`
          : `Aced is easing you back to ${formatDifficultyBand(next)} to rebuild the pattern cleanly.`,
    };
  }

  if (answered < 3) {
    return {
      direction: "steady",
      label: "finding your level",
      description: `Aced is finding your level, so this session is staying at ${formatDifficultyBand(next)} for now.`,
    };
  }

  if (rollingAccuracy >= 75) {
    return {
      direction: "steady",
      label: "holding strong",
      description: `You’re performing steadily at ${formatDifficultyBand(next)}, so Aced is keeping the pressure right here.`,
    };
  }

  return {
    direction: "steady",
    label: "staying targeted",
    description: `Aced is keeping this at ${formatDifficultyBand(next)} while it learns what support you need most.`,
  };
}
