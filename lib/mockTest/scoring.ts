export type MockSectionKey = "english" | "math" | "reading" | "science";

export function estimateActScaleScore(correct: number, total: number) {
  if (total <= 0) return 1;
  const boundedCorrect = Math.max(0, Math.min(total, correct));
  return Math.max(1, Math.min(36, Math.round(1 + (35 * boundedCorrect) / total)));
}

export function calculateEnhancedComposite(scores: {
  english: number;
  math: number;
  reading: number;
}) {
  return Math.max(
    1,
    Math.min(36, Math.round((scores.english + scores.math + scores.reading) / 3))
  );
}

export function calculateStemScore(math: number, science: number) {
  return Math.max(1, Math.min(36, Math.round((math + science) / 2)));
}

export function calculatePercentile(composite: number, cohortComposites: number[]) {
  if (cohortComposites.length === 0) return 0;
  const strictlyLower = cohortComposites.filter((score) => score < composite).length;
  return Math.max(
    0,
    Math.min(100, Math.round((strictlyLower / cohortComposites.length) * 100))
  );
}

export function buildCompositeDistribution(composites: number[]) {
  const distribution: Record<string, number> = {};
  for (let score = 1; score <= 36; score += 1) {
    distribution[String(score)] = 0;
  }
  for (const composite of composites) {
    const bounded = Math.max(1, Math.min(36, Math.round(composite)));
    distribution[String(bounded)] += 1;
  }
  return distribution;
}
