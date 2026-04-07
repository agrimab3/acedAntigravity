export const DIFFICULTY_BANDS = [
  "foundation",
  "easy",
  "medium",
  "hard",
  "challenge",
] as const;

export type DifficultyBand = (typeof DIFFICULTY_BANDS)[number];

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

  return "easy";
}

export function getDifficultySweep(target: DifficultyBand): DifficultyBand[] {
  const index = DIFFICULTY_BANDS.indexOf(target);
  const seen = new Set<DifficultyBand>([target]);
  const order: DifficultyBand[] = [target];

  for (let offset = 1; offset < DIFFICULTY_BANDS.length; offset += 1) {
    const lower = DIFFICULTY_BANDS[index - offset];
    const upper = DIFFICULTY_BANDS[index + offset];

    if (lower && !seen.has(lower)) {
      seen.add(lower);
      order.push(lower);
    }

    if (upper && !seen.has(upper)) {
      seen.add(upper);
      order.push(upper);
    }
  }

  return order;
}

export function chooseDifficultyBand(snapshot?: SkillSnapshot | null): DifficultyBand {
  if (!snapshot || !snapshot.totalAnswered) {
    return "easy";
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
