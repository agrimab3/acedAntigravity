import {
  chooseDifficultyBand,
  formatDifficultyBand,
  normalizeDifficultyBand,
  type DifficultyBand,
} from "@/lib/adaptive";
import { getSectionDefinition, getTopicByName } from "@/lib/act-taxonomy";
import type { PracticeTestSectionKey } from "@/lib/practice-tests";

export type PracticeTestRemediationTopicSignal = {
  sectionKey: PracticeTestSectionKey;
  sectionTitle: string;
  topicName: string;
  misses: number;
  attempts: number;
  unansweredCount?: number;
  flaggedCount?: number;
  masteryPct?: number | null;
  rollingAccuracyPct?: number | null;
  currentDifficulty?: string | null;
  totalAnswered?: number | null;
};

export type PracticeTestRemediationSectionSignal = {
  sectionKey: PracticeTestSectionKey;
  title: string;
  accuracyPct: number;
  answeredCount: number;
  questionCount: number;
  pacingTone?: "ahead" | "steady" | "behind";
};

export type PracticeTestRemediationStep = {
  order: number;
  sectionKey: PracticeTestSectionKey;
  sectionTitle: string;
  sectionColor: string;
  constellation: string;
  topicName: string;
  topicSlug: string | null;
  misses: number;
  attempts: number;
  accuracyPct: number;
  unansweredCount: number;
  masteryPct: number | null;
  rollingAccuracyPct: number | null;
  currentDifficulty: string;
  recommendedDifficulty: DifficultyBand;
  priorityScore: number;
  reason: string;
  drillHref: string;
  drillLabel: string;
};

export type PracticeTestRemediationPlan = {
  headline: string;
  summary: string;
  weakestSectionKey: PracticeTestSectionKey | null;
  weakestSectionTitle: string | null;
  steps: PracticeTestRemediationStep[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getRecommendedDifficulty(signal: PracticeTestRemediationTopicSignal): DifficultyBand {
  const attempts = Math.max(signal.attempts, 0);
  const accuracyPct =
    attempts > 0 ? Math.round(((attempts - signal.misses) / attempts) * 100) : 0;
  const existingRolling = clamp(Math.round(signal.rollingAccuracyPct ?? accuracyPct), 0, 100);
  const blendedRolling =
    attempts > 0
      ? Math.round((existingRolling * 2 + accuracyPct) / 3)
      : existingRolling;

  return chooseDifficultyBand({
    currentDifficulty: signal.currentDifficulty,
    recentAccuracyPct: accuracyPct,
    rollingAccuracyPct: blendedRolling,
    incorrectStreak: Math.min(3, signal.misses),
    correctStreak: accuracyPct >= 80 && signal.misses === 0 ? 2 : 0,
    totalAnswered: Math.max(signal.totalAnswered ?? 0, attempts),
  });
}

function buildReason(
  signal: PracticeTestRemediationTopicSignal,
  sectionSignal?: PracticeTestRemediationSectionSignal
) {
  const reasons: string[] = [];
  const accuracyPct =
    signal.attempts > 0 ? Math.round(((signal.attempts - signal.misses) / signal.attempts) * 100) : 0;

  reasons.push(
    signal.attempts > 0
      ? `You missed ${signal.misses} of ${signal.attempts} answered question${signal.attempts === 1 ? "" : "s"} in this star`
      : `This star produced ${signal.misses} miss${signal.misses === 1 ? "" : "es"} in the timed run`
  );

  if (signal.masteryPct !== null && signal.masteryPct !== undefined) {
    if (signal.masteryPct <= 55) {
      reasons.push(`saved mastery is still only ${signal.masteryPct}%`);
    } else if (signal.masteryPct <= 75) {
      reasons.push(`mastery is still settling at ${signal.masteryPct}%`);
    }
  } else if ((signal.totalAnswered ?? 0) < 3) {
    reasons.push("Aced still has light data on this star");
  }

  if (sectionSignal?.pacingTone === "behind" && sectionSignal.questionCount > sectionSignal.answeredCount) {
    reasons.push(
      `${sectionSignal.title} pace slipped enough to leave ${sectionSignal.questionCount - sectionSignal.answeredCount} blank`
    );
  } else if (accuracyPct <= 40 && signal.attempts >= 2) {
    reasons.push(`timed accuracy here landed at ${accuracyPct}%`);
  }

  return `${reasons.slice(0, 2).join(". ")}.`.replace(/\.\./g, ".");
}

function getPriorityScore(
  signal: PracticeTestRemediationTopicSignal,
  sectionSignal?: PracticeTestRemediationSectionSignal
) {
  const attempts = Math.max(signal.attempts, 1);
  const accuracyPct = Math.round(((attempts - signal.misses) / attempts) * 100);
  const masteryPenalty =
    signal.masteryPct === null || signal.masteryPct === undefined
      ? 1.25
      : (100 - clamp(signal.masteryPct, 0, 100)) / 28;
  const pacePenalty = sectionSignal?.pacingTone === "behind" ? 0.9 : 0;
  const unansweredPenalty =
    sectionSignal && sectionSignal.questionCount > sectionSignal.answeredCount ? 0.5 : 0;

  return Number(
    (
      signal.misses * 3.2 +
      (100 - accuracyPct) / 18 +
      masteryPenalty +
      (signal.flaggedCount ?? 0) * 0.18 +
      pacePenalty +
      unansweredPenalty
    ).toFixed(2)
  );
}

export function buildPracticeTestRemediationPlan({
  topicSignals,
  sectionSignals,
  maxSteps = 4,
}: {
  topicSignals: PracticeTestRemediationTopicSignal[];
  sectionSignals: PracticeTestRemediationSectionSignal[];
  maxSteps?: number;
}): PracticeTestRemediationPlan {
  const weakestSection =
    [...sectionSignals].sort((left, right) => {
      if (left.accuracyPct !== right.accuracyPct) {
        return left.accuracyPct - right.accuracyPct;
      }

      const leftUnanswered = left.questionCount - left.answeredCount;
      const rightUnanswered = right.questionCount - right.answeredCount;
      return rightUnanswered - leftUnanswered;
    })[0] ?? null;

  const steps = topicSignals
    .filter((signal) => signal.misses > 0)
    .map((signal) => {
      const sectionDefinition = getSectionDefinition(signal.sectionKey);
      const topicDefinition = getTopicByName(signal.sectionKey, signal.topicName);
      const sectionSignal = sectionSignals.find((section) => section.sectionKey === signal.sectionKey);
      const accuracyPct =
        signal.attempts > 0 ? Math.round(((signal.attempts - signal.misses) / signal.attempts) * 100) : 0;
      const recommendedDifficulty = getRecommendedDifficulty(signal);
      const priorityScore = getPriorityScore(signal, sectionSignal);

      return {
        order: 0,
        sectionKey: signal.sectionKey,
        sectionTitle: signal.sectionTitle,
        sectionColor: sectionDefinition?.color ?? "#F4F0E8",
        constellation: sectionDefinition?.constellation ?? signal.sectionTitle,
        topicName: signal.topicName,
        topicSlug: topicDefinition?.slug ?? null,
        misses: signal.misses,
        attempts: signal.attempts,
        accuracyPct,
        unansweredCount: signal.unansweredCount ?? 0,
        masteryPct: signal.masteryPct ?? null,
        rollingAccuracyPct: signal.rollingAccuracyPct ?? null,
        currentDifficulty: normalizeDifficultyBand(signal.currentDifficulty),
        recommendedDifficulty,
        priorityScore,
        reason: buildReason(signal, sectionSignal),
        drillHref: `/practice?section=${signal.sectionKey}&topic=${encodeURIComponent(signal.topicName)}&difficulty=${recommendedDifficulty}&source=practice-test`,
        drillLabel: `${formatDifficultyBand(recommendedDifficulty)} 10-question drill`,
      } satisfies PracticeTestRemediationStep;
    })
    .sort((left, right) => right.priorityScore - left.priorityScore)
    .slice(0, Math.max(1, maxSteps))
    .map((step, index) => ({
      ...step,
      order: index + 1,
    }));

  if (steps.length === 0) {
    const fallbackSummary =
      weakestSection?.pacingTone === "behind"
        ? `${weakestSection.title} was the shakiest section for pacing, but no single star produced repeat misses.`
        : "No single weak star separated itself from this run, so the best next move is to keep building from your dashboard constellation.";

    return {
      headline: "no obvious weak stars",
      summary: fallbackSummary,
      weakestSectionKey: weakestSection?.sectionKey ?? null,
      weakestSectionTitle: weakestSection?.title ?? null,
      steps: [],
    };
  }

  const [firstStep, secondStep] = steps;
  const summaryParts = [
    `Start with ${firstStep.topicName} on ${formatDifficultyBand(firstStep.recommendedDifficulty)} to rebuild the sharpest miss cluster.`,
  ];

  if (secondStep) {
    summaryParts.push(`Then move into ${secondStep.topicName} so the next biggest leak does not stick around.`);
  }

  if (weakestSection && weakestSection.sectionKey !== firstStep.sectionKey) {
    summaryParts.push(`${weakestSection.title} was still the weakest overall section from this run.`);
  }

  return {
    headline: "practice these stars next",
    summary: summaryParts.join(" "),
    weakestSectionKey: weakestSection?.sectionKey ?? null,
    weakestSectionTitle: weakestSection?.title ?? null,
    steps,
  };
}
