import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { actTopics, questionExposures, questions, questionSets } from "@/db/schema";
import type * as schema from "@/db/schema";
import { hydrateQuestionSetContext, validateQuestionSetLink } from "@/lib/question-sets";
import { normalizeQuestionRow, type NormalizedQuestionRow } from "@/lib/question-utils";
import {
  getPracticeTestMode,
  normalizePracticeTestModeKey,
  PRACTICE_TEST_MODES,
  type PracticeTestMode,
  type PracticeTestSectionKey,
} from "@/lib/practice-tests";

export { getPracticeTestMode, normalizePracticeTestModeKey };

export type PracticeTestSectionPayload = {
  sectionKey: PracticeTestSectionKey;
  title: string;
  questionCount: number;
  durationMinutes: number;
  questions: NormalizedQuestionRow[];
  availableCount: number;
};

function logSectionMismatch({
  requestedSection,
  questionId,
  questionSection,
  topicName,
}: {
  requestedSection: PracticeTestSectionKey;
  questionId: string;
  questionSection: string;
  topicName: string;
}) {
  console.error("[practice-test-engine] Rejected mismatched question row", {
    requestedSection,
    questionId,
    questionSection,
    topicName,
  });
}

function logQuestionSetMismatch({
  questionId,
  questionSetId,
  reason,
}: {
  questionId: string;
  questionSetId: string;
  reason: string;
}) {
  console.error("[practice-test-engine] Rejected mismatched question set link", {
    questionId,
    questionSetId,
    reason,
  });
}

export async function fetchPracticeTestSectionQuestions({
  db,
  userId,
  sectionKey,
  count,
}: {
  db: NodePgDatabase<typeof schema> | null;
  userId: string | null;
  sectionKey: PracticeTestSectionKey;
  count: number;
}): Promise<PracticeTestSectionPayload> {
  const modeSection = PRACTICE_TEST_MODES.flatMap((mode) => mode.sections).find(
    (section) => section.key === sectionKey
  );
  const title = modeSection?.label ?? sectionKey;

  if (!db) {
    console.error("[practice-test-engine] Database unavailable", {
      sectionKey,
      requested: count,
    });
    throw new Error("This test isn't available right now. Try a different one.");
  }

  const rows = userId
    ? await db
        .select({
          id: questions.id,
          section: questions.sectionKey,
          topicId: questions.topicId,
          topic: actTopics.name,
          difficulty: questions.difficulty,
          passage: questions.passage,
          questionSetId: questions.questionSetId,
          questionSetSectionKey: questionSets.sectionKey,
          questionSetTopicId: questionSets.topicId,
          questionSetKind: questionSets.kind,
          questionSetTitle: questionSets.title,
          questionSetContent: questionSets.content,
          question_text: questions.prompt,
          choices: questions.choices,
          correct_answer: questions.correctAnswer,
          explanation: questions.explanation,
        })
        .from(questions)
        .innerJoin(actTopics, eq(questions.topicId, actTopics.id))
        .leftJoin(questionSets, eq(questions.questionSetId, questionSets.id))
        .leftJoin(
          questionExposures,
          and(eq(questionExposures.questionId, questions.id), eq(questionExposures.userId, userId))
        )
        .where(
          and(
            eq(questions.status, "published"),
            eq(questions.usageScope, "practice"),
            eq(questions.sectionKey, sectionKey),
            eq(actTopics.sectionKey, sectionKey),
            eq(actTopics.isActive, true)
          )
        )
        .orderBy(
          sql`case when ${questionExposures.id} is null then 0 else 1 end asc`,
          sql`coalesce(${questionExposures.timesSeen}, 0) asc`,
          sql`random()`
        )
        .limit(count * 5)
    : await db
        .select({
          id: questions.id,
          section: questions.sectionKey,
          topicId: questions.topicId,
          topic: actTopics.name,
          difficulty: questions.difficulty,
          passage: questions.passage,
          questionSetId: questions.questionSetId,
          questionSetSectionKey: questionSets.sectionKey,
          questionSetTopicId: questionSets.topicId,
          questionSetKind: questionSets.kind,
          questionSetTitle: questionSets.title,
          questionSetContent: questionSets.content,
          question_text: questions.prompt,
          choices: questions.choices,
          correct_answer: questions.correctAnswer,
          explanation: questions.explanation,
        })
        .from(questions)
        .innerJoin(actTopics, eq(questions.topicId, actTopics.id))
        .leftJoin(questionSets, eq(questions.questionSetId, questionSets.id))
        .where(
          and(
            eq(questions.status, "published"),
            eq(questions.usageScope, "practice"),
            eq(questions.sectionKey, sectionKey),
            eq(actTopics.sectionKey, sectionKey),
            eq(actTopics.isActive, true)
          )
        )
        .orderBy(sql`random()`)
        .limit(count * 5);

  const normalized = new Map<string, NormalizedQuestionRow>();

  rows.forEach((row) => {
    const setValidation = validateQuestionSetLink({
      questionId: row.id,
      questionSectionKey: row.section,
      questionTopicId: row.topicId,
      questionSetId: row.questionSetId,
      questionSetSectionKey: row.questionSetSectionKey,
      questionSetTopicId: row.questionSetTopicId,
    });

    if (!setValidation.ok && row.questionSetId) {
      logQuestionSetMismatch({
        questionId: row.id,
        questionSetId: row.questionSetId,
        reason: setValidation.reason,
      });
    }

    const hydratedSet = hydrateQuestionSetContext({
      questionId: row.id,
      questionSectionKey: row.section,
      questionTopicId: row.topicId,
      questionSetId: row.questionSetId,
      questionSetSectionKey: row.questionSetSectionKey,
      questionSetTopicId: row.questionSetTopicId,
      questionSetKind: row.questionSetKind,
      questionSetTitle: row.questionSetTitle,
      questionSetContent: row.questionSetContent,
      passage: row.passage,
    });

    const question = normalizeQuestionRow({
      ...row,
      passage: hydratedSet.effectivePassage,
      questionSetId: hydratedSet.questionSet?.id ?? null,
      questionSetKind: hydratedSet.questionSet?.kind ?? null,
      questionSetTitle: hydratedSet.questionSet?.title ?? null,
      questionSetContent: hydratedSet.questionSet?.content ?? null,
    });
    if (!question) {
      return;
    }

    if (question.section !== sectionKey) {
      logSectionMismatch({
        requestedSection: sectionKey,
        questionId: question.id,
        questionSection: question.section,
        topicName: question.topic,
      });
      return;
    }

    if (!normalized.has(question.id)) {
      normalized.set(question.id, question);
    }
  });

  const selected = Array.from(normalized.values()).slice(0, count);

  if (selected.length < count) {
    console.error("[practice-test-engine] Not enough real questions for practice test section", {
      sectionKey,
      requested: count,
      available: selected.length,
    });
    throw new Error("This test isn't available right now. Try a different one.");
  }

  return {
    sectionKey,
    title,
    questionCount: count,
    durationMinutes: modeSection?.durationMinutes ?? Math.ceil(count),
    questions: selected,
    availableCount: selected.length,
  };
}

export async function buildPracticeTestPayload({
  db,
  userId,
  mode,
}: {
  db: NodePgDatabase<typeof schema> | null;
  userId: string | null;
  mode: PracticeTestMode;
}) {
  const sections = await Promise.all(
    mode.sections.map((section) =>
      fetchPracticeTestSectionQuestions({
        db,
        userId,
        sectionKey: section.key,
        count: section.questionCount,
      })
    )
  );

  return {
    mode,
    sections,
  };
}
