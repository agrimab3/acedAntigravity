import type { PracticeTestSectionKey } from "@/lib/practice-tests";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function estimatePracticeTestSectionScore(
  sectionKey: PracticeTestSectionKey,
  correctCount: number,
  totalQuestions: number
) {
  const safeTotal = Math.max(totalQuestions, 1);
  const accuracy = clamp(correctCount / safeTotal, 0, 1);

  const curveExponent =
    sectionKey === "math" ? 0.94 : sectionKey === "reading" || sectionKey === "science" ? 0.97 : 0.95;
  const scaled = 1 + Math.pow(accuracy, curveExponent) * 35;

  return clamp(Math.round(scaled), 1, 36);
}

export function estimatePracticeTestCompositeScore(sectionScores: number[]) {
  if (sectionScores.length === 0) {
    return null;
  }

  const average = sectionScores.reduce((sum, score) => sum + score, 0) / sectionScores.length;
  return clamp(Math.round(average), 1, 36);
}
