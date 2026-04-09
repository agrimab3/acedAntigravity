import { normalizeDifficultyBand } from "@/lib/adaptive";

export type TopicScoreInput = {
  sectionKey: string;
  topicName: string;
  masteryPct?: number | null;
  rollingAccuracyPct?: number | null;
  currentDifficulty?: string | null;
  totalAnswered?: number | null;
  averageTimeSpentSeconds?: number | null;
  hintsUsed?: number | null;
};

export type TopicScoreSummary = {
  sectionKey: string;
  topicName: string;
  masteryPct: number;
  rollingAccuracyPct: number;
  currentDifficulty: string;
  totalAnswered: number;
  averageTimeSpentSeconds: number;
  hintsUsed: number;
  estimatedScore: number;
  confidence: number;
  scoreLabel: "baseline estimate" | "building estimate" | "live estimate";
  scoreExplanation: string;
};

export type SectionScoreSummary = {
  sectionKey: string;
  estimatedScore: number;
  confidence: number;
  answeredCount: number;
  topicsAttempted: number;
  scoreLabel: "baseline estimate" | "building estimate" | "live estimate";
  scoreExplanation: string;
};

const BASELINE_ACT_SCORE = 18;
const SECTION_TARGET_TIME_SECONDS: Record<string, number> = {
  english: 36,
  math: 60,
  reading: 53,
  science: 53,
};

const DIFFICULTY_BOOST: Record<string, number> = {
  foundation: -2,
  easy: -0.5,
  medium: 0.75,
  hard: 2,
  challenge: 3,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getEstimateLabel(
  confidence: number,
  sampleCount: number
): "baseline estimate" | "building estimate" | "live estimate" {
  if (sampleCount < 3 || confidence < 0.28) {
    return "baseline estimate";
  }

  if (sampleCount < 8 || confidence < 0.68) {
    return "building estimate";
  }

  return "live estimate";
}

function buildTopicScoreExplanation(summary: TopicScoreSummary) {
  const reasons: string[] = [];
  const targetTime = SECTION_TARGET_TIME_SECONDS[summary.sectionKey] ?? 50;
  const hintRate = summary.totalAnswered > 0 ? summary.hintsUsed / summary.totalAnswered : 0;

  if (summary.scoreLabel === "baseline estimate") {
    reasons.push("This is based on only a few answers so far");
  } else {
    reasons.push(`This reflects ${summary.totalAnswered} answered question${summary.totalAnswered === 1 ? "" : "s"}`);
  }

  if (summary.rollingAccuracyPct >= 80) {
    reasons.push("accuracy is running strong");
  } else if (summary.rollingAccuracyPct <= 45 && summary.totalAnswered > 0) {
    reasons.push("accuracy still needs rebuilding");
  }

  if (summary.currentDifficulty === "hard" || summary.currentDifficulty === "challenge") {
    reasons.push(`you are holding ${summary.currentDifficulty} difficulty`);
  } else if (summary.currentDifficulty === "foundation") {
    reasons.push("the skill is still in rebuild mode");
  }

  if (summary.totalAnswered >= 3 && hintRate >= 0.5) {
    reasons.push("heavy hint use is keeping the estimate cautious");
  }

  if (summary.averageTimeSpentSeconds > 0 && summary.totalAnswered >= 3) {
    if (summary.averageTimeSpentSeconds > targetTime * 1.45) {
      reasons.push("timing is still slower than ACT pace");
    } else if (summary.averageTimeSpentSeconds < targetTime * 0.95 && summary.rollingAccuracyPct >= 70) {
      reasons.push("timing is close to ACT pace");
    }
  }

  return `${reasons.slice(0, 3).join(". ")}.`.replace(/\.\./g, ".");
}

function buildSectionScoreExplanation(summary: SectionScoreSummary) {
  if (summary.scoreLabel === "baseline estimate") {
    return "This section estimate is still mostly a starting baseline because there are only a few answered questions here.";
  }

  if (summary.scoreLabel === "building estimate") {
    return `This section estimate is building from ${summary.answeredCount} answered questions across ${summary.topicsAttempted} topic${summary.topicsAttempted === 1 ? "" : "s"}.`;
  }

  return `This live section estimate is grounded in ${summary.answeredCount} answered questions across ${summary.topicsAttempted} topic${summary.topicsAttempted === 1 ? "" : "s"}.`;
}

export function estimateTopicScore(input: TopicScoreInput): TopicScoreSummary {
  const masteryPct = clamp(Math.round(input.masteryPct ?? input.rollingAccuracyPct ?? 0), 0, 100);
  const rollingAccuracyPct = clamp(
    Math.round(input.rollingAccuracyPct ?? input.masteryPct ?? 0),
    0,
    100
  );
  const totalAnswered = Math.max(0, input.totalAnswered ?? 0);
  const averageTimeSpentSeconds = Math.max(0, input.averageTimeSpentSeconds ?? 0);
  const hintsUsed = Math.max(0, input.hintsUsed ?? 0);
  const currentDifficulty = normalizeDifficultyBand(input.currentDifficulty);
  const difficultyBoost = DIFFICULTY_BOOST[currentDifficulty] ?? 0;
  const confidence = clamp(totalAnswered / 10, 0, 1);
  const hintRate = totalAnswered > 0 ? hintsUsed / totalAnswered : 0;
  const hintPenalty = clamp(hintRate * 2.6, 0, 2.6);
  const targetTime = SECTION_TARGET_TIME_SECONDS[input.sectionKey] ?? 50;
  const timingRatio = averageTimeSpentSeconds > 0 ? averageTimeSpentSeconds / targetTime : 1;
  const timingAdjustment =
    averageTimeSpentSeconds === 0
      ? 0
      : timingRatio <= 0.95 && rollingAccuracyPct >= 70
        ? 0.9
        : timingRatio >= 1.6 && rollingAccuracyPct <= 70
          ? -1.25
          : timingRatio >= 1.3
            ? -0.55
            : 0;
  const rawScore = 11 + masteryPct * 0.22 + difficultyBoost + timingAdjustment - hintPenalty;
  const blendedScore = BASELINE_ACT_SCORE * (1 - confidence) + rawScore * confidence;
  const summary: TopicScoreSummary = {
    sectionKey: input.sectionKey,
    topicName: input.topicName,
    masteryPct,
    rollingAccuracyPct,
    currentDifficulty,
    totalAnswered,
    averageTimeSpentSeconds,
    hintsUsed,
    estimatedScore: clamp(Math.round(blendedScore), 1, 36),
    confidence,
    scoreLabel: getEstimateLabel(confidence, totalAnswered),
    scoreExplanation: "",
  };

  summary.scoreExplanation = buildTopicScoreExplanation(summary);

  return summary;
}

export function estimateSectionScore(sectionKey: string, topics: TopicScoreSummary[]): SectionScoreSummary {
  const answeredTopics = topics.filter((topic) => topic.totalAnswered > 0);
  const answeredCount = answeredTopics.reduce((sum, topic) => sum + topic.totalAnswered, 0);
  const topicsAttempted = answeredTopics.length;

  if (answeredTopics.length === 0) {
    return {
      sectionKey,
      estimatedScore: BASELINE_ACT_SCORE,
      confidence: 0,
      answeredCount: 0,
      topicsAttempted: 0,
      scoreLabel: "baseline estimate",
      scoreExplanation:
        "This section estimate is still at the baseline because there is not enough answered data yet.",
    };
  }

  const averageTopicScore =
    answeredTopics.reduce((sum, topic) => sum + topic.estimatedScore, 0) / answeredTopics.length;
  const confidence =
    clamp(answeredCount / 24, 0, 1) * 0.55 +
    clamp(topicsAttempted / Math.max(topics.length, 1), 0, 1) * 0.45;
  const blendedScore = BASELINE_ACT_SCORE * (1 - confidence) + averageTopicScore * confidence;

  const summary: SectionScoreSummary = {
    sectionKey,
    estimatedScore: clamp(Math.round(blendedScore), 1, 36),
    confidence: clamp(confidence, 0, 1),
    answeredCount,
    topicsAttempted,
    scoreLabel: getEstimateLabel(confidence, answeredCount),
    scoreExplanation: "",
  };

  summary.scoreExplanation = buildSectionScoreExplanation(summary);

  return summary;
}

export function estimateCompositeScore(sectionSummaries: SectionScoreSummary[]) {
  if (sectionSummaries.length === 0) {
    return {
      estimatedScore: BASELINE_ACT_SCORE,
      confidence: 0,
      scoreLabel: "baseline estimate" as const,
      scoreExplanation: "This overall estimate is still a baseline because there is no answered data yet.",
    };
  }

  const averageScore =
    sectionSummaries.reduce((sum, section) => sum + section.estimatedScore, 0) /
    sectionSummaries.length;
  const averageConfidence =
    sectionSummaries.reduce((sum, section) => sum + section.confidence, 0) /
    sectionSummaries.length;

  return {
    estimatedScore: clamp(Math.round(averageScore), 1, 36),
    confidence: clamp(Number(averageConfidence.toFixed(2)), 0, 1),
    scoreLabel: getEstimateLabel(averageConfidence, sectionSummaries.reduce((sum, section) => sum + section.answeredCount, 0)),
    scoreExplanation:
      averageConfidence < 0.28
        ? "This overall estimate is still mostly baseline because only a small amount of practice data is available."
        : averageConfidence < 0.68
          ? "This overall estimate is building as more real performance data comes in across your sections."
          : "This overall estimate is live and grounded in your recent performance across sections.",
  };
}
