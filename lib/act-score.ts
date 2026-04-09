import { normalizeDifficultyBand } from "@/lib/adaptive";

export type TopicScoreInput = {
  topicName: string;
  masteryPct?: number | null;
  rollingAccuracyPct?: number | null;
  currentDifficulty?: string | null;
  totalAnswered?: number | null;
};

export type TopicScoreSummary = {
  topicName: string;
  masteryPct: number;
  rollingAccuracyPct: number;
  currentDifficulty: string;
  totalAnswered: number;
  estimatedScore: number;
  confidence: number;
};

export type SectionScoreSummary = {
  sectionKey: string;
  estimatedScore: number;
  confidence: number;
  answeredCount: number;
  topicsAttempted: number;
};

const BASELINE_ACT_SCORE = 18;

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

export function estimateTopicScore(input: TopicScoreInput): TopicScoreSummary {
  const masteryPct = clamp(Math.round(input.masteryPct ?? input.rollingAccuracyPct ?? 0), 0, 100);
  const rollingAccuracyPct = clamp(
    Math.round(input.rollingAccuracyPct ?? input.masteryPct ?? 0),
    0,
    100
  );
  const totalAnswered = Math.max(0, input.totalAnswered ?? 0);
  const currentDifficulty = normalizeDifficultyBand(input.currentDifficulty);
  const difficultyBoost = DIFFICULTY_BOOST[currentDifficulty] ?? 0;
  const confidence = clamp(totalAnswered / 10, 0, 1);
  const rawScore = 11 + masteryPct * 0.22 + difficultyBoost;
  const blendedScore = BASELINE_ACT_SCORE * (1 - confidence) + rawScore * confidence;

  return {
    topicName: input.topicName,
    masteryPct,
    rollingAccuracyPct,
    currentDifficulty,
    totalAnswered,
    estimatedScore: clamp(Math.round(blendedScore), 1, 36),
    confidence,
  };
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
    };
  }

  const averageTopicScore =
    answeredTopics.reduce((sum, topic) => sum + topic.estimatedScore, 0) / answeredTopics.length;
  const confidence =
    clamp(answeredCount / 24, 0, 1) * 0.55 +
    clamp(topicsAttempted / Math.max(topics.length, 1), 0, 1) * 0.45;
  const blendedScore = BASELINE_ACT_SCORE * (1 - confidence) + averageTopicScore * confidence;

  return {
    sectionKey,
    estimatedScore: clamp(Math.round(blendedScore), 1, 36),
    confidence: clamp(confidence, 0, 1),
    answeredCount,
    topicsAttempted,
  };
}

export function estimateCompositeScore(sectionSummaries: SectionScoreSummary[]) {
  if (sectionSummaries.length === 0) {
    return {
      estimatedScore: BASELINE_ACT_SCORE,
      confidence: 0,
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
  };
}
