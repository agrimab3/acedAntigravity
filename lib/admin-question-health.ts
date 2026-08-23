import { eq } from "drizzle-orm";
import { actTopics, questions } from "@/db/schema";
import { getDb } from "@/lib/db";
import { reviewQuestionQuality } from "@/lib/question-utils";

const SECTION_DEMAND = {
  english: 50,
  math: 45,
  reading: 36,
  science: 40,
} as const;

const SECTION_TARGETS = {
  english: 250,
  math: 225,
  reading: 180,
  science: 200,
} as const;

const INVENTORY_SECTIONS = ["english", "math", "reading", "science"] as const;
const INVENTORY_DIFFICULTIES = ["easy", "medium", "hard"] as const;

type InventorySectionKey = (typeof INVENTORY_SECTIONS)[number];
type InventoryDifficultyKey = (typeof INVENTORY_DIFFICULTIES)[number];

type QuestionHealthRow = {
  questionId: string;
  questionSectionKey: string;
  topicId: string;
  topicSectionKey: string;
  topicSlug: string;
  topicName: string;
  topicIsActive: boolean;
  difficulty: string;
  status: string;
  prompt: string;
  passage: string | null;
  choices: Record<"A" | "B" | "C" | "D", string>;
  correctAnswer: string;
  explanation: string;
  fingerprint: string | null;
};

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizePassage(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function formatPercent(value: number) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function getSectionHealthLabel(inventoryMultiple: number) {
  if (inventoryMultiple < 1) return "critically insufficient";
  if (inventoryMultiple < 2) return "critically sparse";
  if (inventoryMultiple < 4) return "sparse";
  if (inventoryMultiple < 8) return "usable but repeat-prone";
  return "healthy";
}

function getTopicDifficultyHealthLabel(count: number) {
  if (count <= 0) return "empty";
  if (count <= 2) return "critical";
  if (count <= 5) return "very sparse";
  if (count <= 9) return "sparse";
  if (count <= 19) return "usable";
  return "healthy";
}

function createDifficultyCounts() {
  return {
    easy: 0,
    medium: 0,
    hard: 0,
  };
}

export async function getAdminQuestionHealthReport() {
  const db = getDb();

  if (!db) {
    throw new Error("Database unavailable.");
  }

  const [topicRows, questionRows] = await Promise.all([
    db
      .select({
        id: actTopics.id,
        sectionKey: actTopics.sectionKey,
        topicSlug: actTopics.slug,
        topicName: actTopics.name,
        isActive: actTopics.isActive,
      })
      .from(actTopics),
    db
      .select({
        questionId: questions.id,
        questionSectionKey: questions.sectionKey,
        topicId: questions.topicId,
        topicSectionKey: actTopics.sectionKey,
        topicSlug: actTopics.slug,
        topicName: actTopics.name,
        topicIsActive: actTopics.isActive,
        difficulty: questions.difficulty,
        status: questions.status,
        prompt: questions.prompt,
        passage: questions.passage,
        choices: questions.choices,
        correctAnswer: questions.correctAnswer,
        explanation: questions.explanation,
        fingerprint: questions.fingerprint,
      })
      .from(questions)
      .innerJoin(actTopics, eq(questions.topicId, actTopics.id)),
  ]);

  const activeTopics = topicRows.filter((topic) => topic.isActive);
  const topicCountBySection = INVENTORY_SECTIONS.reduce(
    (map, sectionKey) => {
      map.set(
        sectionKey,
        activeTopics.filter((topic) => topic.sectionKey === sectionKey).length
      );
      return map;
    },
    new Map<InventorySectionKey, number>()
  );

  const serveableRows = questionRows.filter((row) => {
    const isSectionConsistent =
      row.questionSectionKey.trim().toLowerCase() === row.topicSectionKey.trim().toLowerCase();
    const qualityReview = reviewQuestionQuality({
      id: row.questionId,
      section: row.questionSectionKey,
      topic: row.topicName,
      difficulty: row.difficulty,
      passage: row.passage,
      question_text: row.prompt,
      choices: row.choices,
      correct_answer: row.correctAnswer,
      explanation: row.explanation,
    });

    return row.topicIsActive && row.status === "published" && isSectionConsistent && qualityReview.shouldServe;
  });

  const sectionInventory = INVENTORY_SECTIONS.map((sectionKey) => {
    const sectionRows = questionRows.filter((row) => row.questionSectionKey === sectionKey);
    const publishedRows = sectionRows.filter((row) => row.status === "published");
    const serveableSectionRows = serveableRows.filter((row) => row.questionSectionKey === sectionKey);
    const malformedRows = sectionRows.filter(
      (row) => row.questionSectionKey.trim().toLowerCase() !== row.topicSectionKey.trim().toLowerCase()
    );
    const draftRows = sectionRows.filter((row) => row.status === "draft");
    const rejectedRows = sectionRows.filter((row) => row.status === "rejected");
    const nonPublishedRows = sectionRows.filter((row) => row.status !== "published");
    const blockedPublishedRows = Math.max(0, publishedRows.length - serveableSectionRows.length);
    const fullTestDemand = SECTION_DEMAND[sectionKey];
    const inventoryMultiple = serveableSectionRows.length / fullTestDemand;

    return {
      sectionKey,
      topicCount: topicCountBySection.get(sectionKey) ?? 0,
      totalRows: sectionRows.length,
      publishedRows: publishedRows.length,
      serveableRows: serveableSectionRows.length,
      blockedPublishedRows,
      nonPublishedRows: nonPublishedRows.length,
      draftRows: draftRows.length,
      rejectedRows: rejectedRows.length,
      malformedRows: malformedRows.length,
      fullTestDemand,
      inventoryMultiple: formatPercent(inventoryMultiple),
      health: getSectionHealthLabel(inventoryMultiple),
    };
  });

  const topicDifficultyInventory = activeTopics
    .map((topic) => {
      const rows = serveableRows.filter((row) => row.topicId === topic.id);
      const difficultyCounts = createDifficultyCounts();
      let otherDifficultyCount = 0;

      rows.forEach((row) => {
        const normalizedDifficulty = row.difficulty.trim().toLowerCase();
        if (normalizedDifficulty in difficultyCounts) {
          difficultyCounts[normalizedDifficulty as InventoryDifficultyKey] += 1;
        } else {
          otherDifficultyCount += 1;
        }
      });

      return {
        sectionKey: topic.sectionKey,
        topicSlug: topic.topicSlug,
        topicName: topic.topicName,
        easy: {
          count: difficultyCounts.easy,
          health: getTopicDifficultyHealthLabel(difficultyCounts.easy),
        },
        medium: {
          count: difficultyCounts.medium,
          health: getTopicDifficultyHealthLabel(difficultyCounts.medium),
        },
        hard: {
          count: difficultyCounts.hard,
          health: getTopicDifficultyHealthLabel(difficultyCounts.hard),
        },
        otherDifficultyCount,
        totalServeable: rows.length,
      };
    })
    .sort((left, right) => {
      if (left.sectionKey !== right.sectionKey) {
        return left.sectionKey.localeCompare(right.sectionKey);
      }

      return left.topicName.localeCompare(right.topicName);
    });

  const passageHealth = (["reading", "science"] as const).map((sectionKey) => {
    const rows = serveableRows.filter((row) => row.questionSectionKey === sectionKey);
    const passageCounts = rows.reduce((map, row) => {
      const normalizedPassage = normalizePassage(row.passage);
      if (!normalizedPassage) {
        return map;
      }

      map.set(normalizedPassage, (map.get(normalizedPassage) ?? 0) + 1);
      return map;
    }, new Map<string, number>());

    return {
      sectionKey,
      serveableQuestionCount: rows.length,
      approximateUniquePassages: passageCounts.size,
      averageQuestionsPerPassage:
        passageCounts.size > 0 ? formatPercent(rows.length / passageCounts.size) : 0,
      topics: topicDifficultyInventory
        .filter((topic) => topic.sectionKey === sectionKey)
        .map((topic) => ({
          topicSlug: topic.topicSlug,
          topicName: topic.topicName,
          totalServeable: topic.totalServeable,
        })),
    };
  });

  const mismatchRows = questionRows.filter(
    (row) => row.questionSectionKey.trim().toLowerCase() !== row.topicSectionKey.trim().toLowerCase()
  );
  const mismatchGroups = Array.from(
    mismatchRows.reduce((map, row) => {
      const key = `${row.questionSectionKey}->${row.topicSectionKey}`;
      const current = map.get(key) ?? {
        questionSectionKey: row.questionSectionKey,
        topicSectionKey: row.topicSectionKey,
        count: 0,
        questionIds: [] as string[],
      };

      current.count += 1;
      if (current.questionIds.length < 10) {
        current.questionIds.push(row.questionId);
      }
      map.set(key, current);
      return map;
    }, new Map<string, {
      questionSectionKey: string;
      topicSectionKey: string;
      count: number;
      questionIds: string[];
    }>())
  )
    .map(([, value]) => value)
    .sort((left, right) => right.count - left.count);

  const fingerprintDuplicateGroups = Array.from(
    questionRows.reduce((map, row) => {
      if (!row.fingerprint) {
        return map;
      }

      const current = map.get(row.fingerprint) ?? [];
      current.push(row);
      map.set(row.fingerprint, current);
      return map;
    }, new Map<string, QuestionHealthRow[]>())
  )
    .map(([, rows]) => rows)
    .filter((rows) => rows.length > 1);

  const fingerprintDuplicateRisk = {
    duplicateGroupCount: fingerprintDuplicateGroups.length,
    affectedQuestionCount: fingerprintDuplicateGroups.reduce((sum, rows) => sum + rows.length, 0),
    sections: INVENTORY_SECTIONS.map((sectionKey) => ({
      sectionKey,
      affectedQuestionCount: fingerprintDuplicateGroups.reduce(
        (sum, rows) =>
          sum +
          rows.filter((row) => row.questionSectionKey === sectionKey).length,
        0
      ),
    })),
    sampleGroups: fingerprintDuplicateGroups.slice(0, 10).map((rows) => ({
      fingerprint: rows[0]?.fingerprint ?? null,
      count: rows.length,
      questionIds: rows.slice(0, 10).map((row) => row.questionId),
      sections: Array.from(new Set(rows.map((row) => row.questionSectionKey))).sort(),
    })),
  };

  const stemDuplicateGroups = Array.from(
    questionRows
      .filter((row) => row.topicIsActive && row.status === "published")
      .reduce((map, row) => {
        const key = normalizeText(row.prompt);
        const current = map.get(key) ?? [];
        current.push(row);
        map.set(key, current);
        return map;
      }, new Map<string, QuestionHealthRow[]>())
  )
    .map(([, rows]) => rows)
    .filter((rows) => rows.length > 1);

  const stemDuplicateRisk = {
    duplicateGroupCount: stemDuplicateGroups.length,
    affectedQuestionCount: stemDuplicateGroups.reduce((sum, rows) => sum + rows.length, 0),
    sections: INVENTORY_SECTIONS.map((sectionKey) => ({
      sectionKey,
      affectedQuestionCount: stemDuplicateGroups.reduce(
        (sum, rows) =>
          sum +
          rows.filter((row) => row.questionSectionKey === sectionKey).length,
        0
      ),
    })),
    sampleGroups: stemDuplicateGroups.slice(0, 10).map((rows) => ({
      count: rows.length,
      questionIds: rows.slice(0, 10).map((row) => row.questionId),
      sections: Array.from(new Set(rows.map((row) => row.questionSectionKey))).sort(),
    })),
  };

  const topicCountsBySection = activeTopics.reduce((map, topic) => {
    const current = map.get(topic.sectionKey as InventorySectionKey) ?? 0;
    map.set(topic.sectionKey as InventorySectionKey, current + 1);
    return map;
  }, new Map<InventorySectionKey, number>());

  const recommendedBacklog = topicDifficultyInventory
    .flatMap((topic) => {
      const sectionTarget = SECTION_TARGETS[topic.sectionKey as InventorySectionKey];
      const topicCount = Math.max(topicCountsBySection.get(topic.sectionKey as InventorySectionKey) ?? 1, 1);
      const targetPerDifficulty = Math.ceil(sectionTarget / (topicCount * INVENTORY_DIFFICULTIES.length));

      return INVENTORY_DIFFICULTIES.map((difficulty) => {
        const currentCount = topic[difficulty].count;
        const gap = Math.max(0, targetPerDifficulty - currentCount);
        const isPassageSection =
          topic.sectionKey === "reading" || topic.sectionKey === "science";

        return {
          sectionKey: topic.sectionKey,
          topicSlug: topic.topicSlug,
          topicName: topic.topicName,
          difficulty,
          currentCount,
          targetCount: targetPerDifficulty,
          gap,
          health: topic[difficulty].health,
          suggestedStimulusSets:
            isPassageSection && gap > 0 ? Math.ceil(gap / 6) : 0,
        };
      });
    })
    .filter((item) => item.gap > 0)
    .sort((left, right) => {
      if (right.gap !== left.gap) {
        return right.gap - left.gap;
      }

      if (left.sectionKey !== right.sectionKey) {
        return left.sectionKey.localeCompare(right.sectionKey);
      }

      if (left.topicName !== right.topicName) {
        return left.topicName.localeCompare(right.topicName);
      }

      return left.difficulty.localeCompare(right.difficulty);
    });

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      sectionDemand: SECTION_DEMAND,
      sectionTargets: SECTION_TARGETS,
      difficultyValues: INVENTORY_DIFFICULTIES,
      serveableDefinition:
        "published + active topic + section/topic match + quality review pass",
    },
    sectionInventory,
    topicDifficultyInventory,
    passageHealth,
    integrityIssues: {
      mismatchTotal: mismatchRows.length,
      mismatchGroups,
    },
    duplicateRisk: {
      fingerprint: fingerprintDuplicateRisk,
      normalizedStem: stemDuplicateRisk,
    },
    recommendedBacklog,
  };
}
