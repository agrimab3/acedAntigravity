import type { PracticeTestSectionKey } from "@/lib/practice-tests";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const TARGET_SECONDS_PER_QUESTION: Record<PracticeTestSectionKey, number> = {
  english: 42,
  math: 67,
  reading: 67,
  science: 60,
};

export type PracticeTestPacingSummary = {
  label: "ahead of pace" | "on pace" | "behind pace";
  tone: "ahead" | "steady" | "behind";
  avgSecondsPerAnswered: number;
  targetSecondsPerQuestion: number;
  paceDeltaSeconds: number;
  description: string;
};

export function summarizePracticeTestPacing({
  sectionKey,
  questionCount,
  answeredCount,
  durationSeconds,
  timeLimitSeconds,
}: {
  sectionKey: PracticeTestSectionKey;
  questionCount: number;
  answeredCount: number;
  durationSeconds: number;
  timeLimitSeconds?: number | null;
}): PracticeTestPacingSummary {
  const safeQuestionCount = Math.max(questionCount, 1);
  const safeAnsweredCount = Math.max(answeredCount, 1);
  const targetSecondsPerQuestion = Math.round(
    (timeLimitSeconds && timeLimitSeconds > 0
      ? timeLimitSeconds / safeQuestionCount
      : TARGET_SECONDS_PER_QUESTION[sectionKey] ?? 60)
  );
  const avgSecondsPerAnswered = Math.round(durationSeconds / safeAnsweredCount);
  const paceDeltaSeconds = avgSecondsPerAnswered - targetSecondsPerQuestion;

  if (paceDeltaSeconds <= -8) {
    return {
      label: "ahead of pace",
      tone: "ahead",
      avgSecondsPerAnswered,
      targetSecondsPerQuestion,
      paceDeltaSeconds,
      description: `You moved about ${Math.abs(paceDeltaSeconds)} seconds faster per answered question than official ACT pace here.`,
    };
  }

  if (paceDeltaSeconds >= 8) {
    return {
      label: "behind pace",
      tone: "behind",
      avgSecondsPerAnswered,
      targetSecondsPerQuestion,
      paceDeltaSeconds,
      description: `You spent about ${paceDeltaSeconds} extra seconds per answered question here, so pacing is still costing you time.`,
    };
  }

  return {
    label: "on pace",
    tone: "steady",
    avgSecondsPerAnswered,
    targetSecondsPerQuestion,
    paceDeltaSeconds,
    description: "Your timing was close to official ACT pace for this section.",
  };
}

export function summarizeCompositePacing(sectionPacing: PracticeTestPacingSummary[]) {
  if (sectionPacing.length === 0) {
    return {
      label: "on pace" as const,
      tone: "steady" as const,
      description: "No pacing read is available yet.",
    };
  }

  const behindCount = sectionPacing.filter((item) => item.tone === "behind").length;
  const aheadCount = sectionPacing.filter((item) => item.tone === "ahead").length;

  if (behindCount >= Math.ceil(sectionPacing.length / 2)) {
    return {
      label: "behind pace" as const,
      tone: "behind" as const,
      description: "Across this run, pacing lagged behind official ACT timing often enough that speed is now part of the score signal.",
    };
  }

  if (aheadCount >= Math.ceil(sectionPacing.length / 2)) {
    return {
      label: "ahead of pace" as const,
      tone: "ahead" as const,
      description: "Across this run, your timing stayed ahead of official ACT pace without collapsing the score signal.",
    };
  }

  return {
    label: "on pace" as const,
    tone: "steady" as const,
    description: "Across this run, your timing stayed fairly close to official ACT pacing.",
  };
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
