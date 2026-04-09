import type { ChoiceMap } from "@/db/schema";
import { reviewQuestionQuality } from "./question-utils";

export const CONTENT_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const CONTENT_PUBLISHED_TARGET = 10;
export const CONTENT_PUBLISHED_DIFFICULTY_TARGET = 3;

export type ContentDifficultyKey = (typeof CONTENT_DIFFICULTIES)[number];
export type ContentReviewPriority = "critical" | "rebuild" | "watch" | "healthy";

export type ContentAuditTopic = {
  id: string;
  sectionKey: string;
  topicSlug: string;
  topicName: string;
};

export type ContentAuditQuestionRow = {
  sectionKey: string;
  topicId: string;
  topicSlug: string;
  topicName: string;
  difficulty: string;
  status: string;
  prompt: string;
  passage: string | null;
  choices: ChoiceMap;
  correctAnswer: string;
  explanation: string;
};

export type ContentDifficultyAudit = {
  difficulty: ContentDifficultyKey;
  publishedCount: number;
  serveablePublishedCount: number;
  blockedPublishedCount: number;
  warningPublishedCount: number;
  draftCount: number;
  serveableDraftCount: number;
  blockedDraftCount: number;
  warningDraftCount: number;
  publishedGapCount: number;
};

export type ContentTopicAudit = {
  sectionKey: string;
  topicSlug: string;
  topicName: string;
  draftCount: number;
  rawPublishedCount: number;
  rejectedCount: number;
  targetCount: number;
  targetPerDifficulty: number;
  serveablePublishedCount: number;
  serveableDraftCount: number;
  blockedPublishedCount: number;
  blockedDraftCount: number;
  warningPublishedCount: number;
  warningDraftCount: number;
  publishedGapCount: number;
  needsWork: boolean;
  reviewPriority: ContentReviewPriority;
  focusDifficulty: ContentDifficultyKey | "balanced";
  recommendedPerDifficulty: number;
  priorityScore: number;
  difficultyBreakdown: ContentDifficultyAudit[];
};

export type ContentTopicSelectionOptions = {
  sectionKeys?: string[];
  priorities?: ContentReviewPriority[];
  preferredDifficulties?: ContentDifficultyKey[];
  maxTopics?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeDifficultyKey(value: string): ContentDifficultyKey | null {
  const normalized = value.trim().toLowerCase();

  if (CONTENT_DIFFICULTIES.includes(normalized as ContentDifficultyKey)) {
    return normalized as ContentDifficultyKey;
  }

  return null;
}

function buildEmptyDifficultyAudit(difficulty: ContentDifficultyKey): ContentDifficultyAudit {
  return {
    difficulty,
    publishedCount: 0,
    serveablePublishedCount: 0,
    blockedPublishedCount: 0,
    warningPublishedCount: 0,
    draftCount: 0,
    serveableDraftCount: 0,
    blockedDraftCount: 0,
    warningDraftCount: 0,
    publishedGapCount: CONTENT_PUBLISHED_DIFFICULTY_TARGET,
  };
}

function resolveReviewPriority({
  publishedGapCount,
  blockedPublishedCount,
  warningPublishedCount,
  hardGap,
  mediumGap,
}: {
  publishedGapCount: number;
  blockedPublishedCount: number;
  warningPublishedCount: number;
  hardGap: number;
  mediumGap: number;
}): ContentReviewPriority {
  if (publishedGapCount >= 5 || hardGap >= 2 || mediumGap >= 2) {
    return "critical";
  }

  if (publishedGapCount > 0 || blockedPublishedCount > 0) {
    return "rebuild";
  }

  if (warningPublishedCount > 0) {
    return "watch";
  }

  return "healthy";
}

function resolveFocusDifficulty(breakdown: ContentDifficultyAudit[]) {
  const ranked = [...breakdown].sort((left, right) => {
    if (right.publishedGapCount !== left.publishedGapCount) {
      return right.publishedGapCount - left.publishedGapCount;
    }

    const priorityOrder: Record<ContentDifficultyKey, number> = {
      hard: 3,
      medium: 2,
      easy: 1,
    };

    return priorityOrder[right.difficulty] - priorityOrder[left.difficulty];
  });

  return ranked[0]?.publishedGapCount > 0 ? ranked[0].difficulty : "balanced";
}

export function getDifficultyGapCount(
  topic: ContentTopicAudit,
  difficulty: ContentDifficultyKey
) {
  return (
    topic.difficultyBreakdown.find((entry) => entry.difficulty === difficulty)?.publishedGapCount ?? 0
  );
}

export function scoreTopicForBacklogFill(
  topic: ContentTopicAudit,
  preferredDifficulties: ContentDifficultyKey[] = ["hard", "medium", "easy"]
) {
  return preferredDifficulties.reduce((score, difficulty, index) => {
    const weight = preferredDifficulties.length - index + 1;
    return score + getDifficultyGapCount(topic, difficulty) * weight * 3;
  }, topic.priorityScore);
}

export function sortTopicsByPriority(
  topics: ContentTopicAudit[],
  preferredDifficulties: ContentDifficultyKey[] = ["hard", "medium", "easy"]
) {
  return [...topics].sort((left, right) => {
    if (left.needsWork !== right.needsWork) {
      return left.needsWork ? -1 : 1;
    }

    const leftScore = scoreTopicForBacklogFill(left, preferredDifficulties);
    const rightScore = scoreTopicForBacklogFill(right, preferredDifficulties);

    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    if (left.sectionKey !== right.sectionKey) {
      return left.sectionKey.localeCompare(right.sectionKey);
    }

    return left.topicName.localeCompare(right.topicName);
  });
}

export function selectTopicsForBacklogFill(
  topics: ContentTopicAudit[],
  {
    sectionKeys,
    priorities = ["critical"],
    preferredDifficulties = ["hard", "medium", "easy"],
    maxTopics = 6,
  }: ContentTopicSelectionOptions = {}
) {
  const normalizedSectionKeys = sectionKeys?.map((sectionKey) => sectionKey.trim().toLowerCase()) ?? null;

  return sortTopicsByPriority(topics, preferredDifficulties)
    .filter((topic) => {
      if (!topic.needsWork) {
        return false;
      }

      if (normalizedSectionKeys && normalizedSectionKeys.length > 0 && !normalizedSectionKeys.includes(topic.sectionKey)) {
        return false;
      }

      if (priorities.length > 0 && !priorities.includes(topic.reviewPriority)) {
        return false;
      }

      return true;
    })
    .slice(0, maxTopics);
}

export function auditTopicInventory(
  topic: ContentAuditTopic,
  questionRows: ContentAuditQuestionRow[]
): ContentTopicAudit {
  const difficultyBreakdownMap = new Map<ContentDifficultyKey, ContentDifficultyAudit>(
    CONTENT_DIFFICULTIES.map((difficulty) => [difficulty, buildEmptyDifficultyAudit(difficulty)])
  );

  let draftCount = 0;
  let rawPublishedCount = 0;
  let rejectedCount = 0;
  let serveablePublishedCount = 0;
  let serveableDraftCount = 0;
  let blockedPublishedCount = 0;
  let blockedDraftCount = 0;
  let warningPublishedCount = 0;
  let warningDraftCount = 0;

  for (const row of questionRows) {
    const difficultyKey = normalizeDifficultyKey(row.difficulty);
    const difficultyAudit = difficultyKey ? difficultyBreakdownMap.get(difficultyKey) : null;

    if (row.status === "rejected") {
      rejectedCount += 1;
      continue;
    }

    const qualityReview = reviewQuestionQuality({
      id: `${topic.id}:${row.difficulty}:${row.status}`,
      section: row.sectionKey,
      topic: row.topicName,
      difficulty: row.difficulty,
      passage: row.passage,
      question_text: row.prompt,
      choices: row.choices,
      correct_answer: row.correctAnswer,
      explanation: row.explanation,
    });

    if (row.status === "published") {
      rawPublishedCount += 1;
      if (difficultyAudit) {
        difficultyAudit.publishedCount += 1;
      }

      if (qualityReview.shouldServe) {
        serveablePublishedCount += 1;
        if (difficultyAudit) {
          difficultyAudit.serveablePublishedCount += 1;
        }
      } else {
        blockedPublishedCount += 1;
        if (difficultyAudit) {
          difficultyAudit.blockedPublishedCount += 1;
        }
      }

      if (qualityReview.warningFlags.length > 0) {
        warningPublishedCount += 1;
        if (difficultyAudit) {
          difficultyAudit.warningPublishedCount += 1;
        }
      }

      continue;
    }

    draftCount += 1;
    if (difficultyAudit) {
      difficultyAudit.draftCount += 1;
    }

    if (qualityReview.shouldServe) {
      serveableDraftCount += 1;
      if (difficultyAudit) {
        difficultyAudit.serveableDraftCount += 1;
      }
    } else {
      blockedDraftCount += 1;
      if (difficultyAudit) {
        difficultyAudit.blockedDraftCount += 1;
      }
    }

    if (qualityReview.warningFlags.length > 0) {
      warningDraftCount += 1;
      if (difficultyAudit) {
        difficultyAudit.warningDraftCount += 1;
      }
    }
  }

  const difficultyBreakdown = CONTENT_DIFFICULTIES.map((difficulty) => {
    const difficultyAudit = difficultyBreakdownMap.get(difficulty);

    if (!difficultyAudit) {
      return buildEmptyDifficultyAudit(difficulty);
    }

    return {
      ...difficultyAudit,
      publishedGapCount: Math.max(
        0,
        CONTENT_PUBLISHED_DIFFICULTY_TARGET - difficultyAudit.serveablePublishedCount
      ),
    };
  });

  const mediumGap =
    difficultyBreakdown.find((difficulty) => difficulty.difficulty === "medium")?.publishedGapCount ?? 0;
  const hardGap =
    difficultyBreakdown.find((difficulty) => difficulty.difficulty === "hard")?.publishedGapCount ?? 0;
  const publishedGapCount = Math.max(0, CONTENT_PUBLISHED_TARGET - serveablePublishedCount);
  const highestDifficultyGap = Math.max(...difficultyBreakdown.map((difficulty) => difficulty.publishedGapCount));
  const needsWork =
    publishedGapCount > 0 || difficultyBreakdown.some((difficulty) => difficulty.publishedGapCount > 0);
  const reviewPriority = resolveReviewPriority({
    publishedGapCount,
    blockedPublishedCount,
    warningPublishedCount,
    hardGap,
    mediumGap,
  });

  return {
    sectionKey: topic.sectionKey,
    topicSlug: topic.topicSlug,
    topicName: topic.topicName,
    draftCount,
    rawPublishedCount,
    rejectedCount,
    targetCount: CONTENT_PUBLISHED_TARGET,
    targetPerDifficulty: CONTENT_PUBLISHED_DIFFICULTY_TARGET,
    serveablePublishedCount,
    serveableDraftCount,
    blockedPublishedCount,
    blockedDraftCount,
    warningPublishedCount,
    warningDraftCount,
    publishedGapCount,
    needsWork,
    reviewPriority,
    focusDifficulty: resolveFocusDifficulty(difficultyBreakdown),
    recommendedPerDifficulty: needsWork
      ? clamp(
          Math.max(highestDifficultyGap, Math.ceil(publishedGapCount / CONTENT_DIFFICULTIES.length)),
          1,
          3
        )
      : 1,
    priorityScore:
      publishedGapCount * 4 +
      mediumGap * 2 +
      hardGap * 3 +
      blockedPublishedCount * 2 +
      warningPublishedCount +
      blockedDraftCount,
    difficultyBreakdown,
  };
}
