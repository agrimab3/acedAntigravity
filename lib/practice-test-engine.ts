import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { actTopics, questionExposures, questions } from "@/db/schema";
import type * as schema from "@/db/schema";
import { buildMockQuestions, type PracticeQuestion } from "@/lib/mock-questions";
import { normalizeQuestionRow, type NormalizedQuestionRow } from "@/lib/question-utils";
import {
  PRACTICE_TEST_MODES,
  type PracticeTestMode,
  type PracticeTestSectionKey,
} from "@/lib/practice-tests";

export type PracticeTestSectionPayload = {
  sectionKey: PracticeTestSectionKey;
  title: string;
  questionCount: number;
  durationMinutes: number;
  questions: Array<PracticeQuestion | NormalizedQuestionRow>;
  usesMockFill: boolean;
  availableCount: number;
};

export function getPracticeTestMode(modeKey: string | null | undefined) {
  return PRACTICE_TEST_MODES.find((mode) => mode.key === modeKey) ?? null;
}

export function buildSectionMockQuestions(
  section: PracticeTestSectionKey,
  limit: number
) {
  const safeLimit = Math.max(limit, 1);
  const topicRotation = {
    english: ["Organization & Flow", "Transitions & Cohesion", "Punctuation", "Grammar & Usage"],
    math: ["Algebra", "Functions", "Geometry", "Statistics & Probability"],
    reading: ["Literary Narrative", "Social Science", "Humanities", "Natural Science"],
    science: ["Data Representation", "Research Summaries", "Conflicting Viewpoints"],
  }[section];

  const mocks: PracticeQuestion[] = [];
  let rotationIndex = 0;

  while (mocks.length < safeLimit) {
    const topicName = topicRotation[rotationIndex % topicRotation.length] ?? "Core Skills";
    const batchSize = Math.min(10, safeLimit - mocks.length);
    const batch = buildMockQuestions(section, topicName, batchSize, "medium");

    batch.forEach((question, batchIndex) => {
      mocks.push({
        ...question,
        id: `section-${section}-mock-${mocks.length + batchIndex + 1}`,
      });
    });

    rotationIndex += 1;
  }

  return mocks.slice(0, safeLimit);
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
    return {
      sectionKey,
      title,
      questionCount: count,
      durationMinutes: Math.ceil(count),
      questions: buildSectionMockQuestions(sectionKey, count),
      usesMockFill: true,
      availableCount: 0,
    };
  }

  const rows = userId
    ? await db
        .select({
          id: questions.id,
          section: questions.sectionKey,
          topic: actTopics.name,
          difficulty: questions.difficulty,
          passage: questions.passage,
          question_text: questions.prompt,
          choices: questions.choices,
          correct_answer: questions.correctAnswer,
          explanation: questions.explanation,
        })
        .from(questions)
        .innerJoin(actTopics, eq(questions.topicId, actTopics.id))
        .leftJoin(
          questionExposures,
          and(eq(questionExposures.questionId, questions.id), eq(questionExposures.userId, userId))
        )
        .where(and(eq(questions.status, "published"), eq(actTopics.sectionKey, sectionKey), eq(actTopics.isActive, true)))
        .orderBy(sql`coalesce(${questionExposures.timesSeen}, 0) asc`, sql`random()`)
        .limit(count * 5)
    : await db
        .select({
          id: questions.id,
          section: questions.sectionKey,
          topic: actTopics.name,
          difficulty: questions.difficulty,
          passage: questions.passage,
          question_text: questions.prompt,
          choices: questions.choices,
          correct_answer: questions.correctAnswer,
          explanation: questions.explanation,
        })
        .from(questions)
        .innerJoin(actTopics, eq(questions.topicId, actTopics.id))
        .where(and(eq(questions.status, "published"), eq(actTopics.sectionKey, sectionKey), eq(actTopics.isActive, true)))
        .orderBy(sql`random()`)
        .limit(count * 5);

  const normalized = new Map<string, NormalizedQuestionRow>();

  rows.forEach((row) => {
    const question = normalizeQuestionRow(row);
    if (question && !normalized.has(question.id)) {
      normalized.set(question.id, question);
    }
  });

  const selected = Array.from(normalized.values()).slice(0, count);
  const missingCount = Math.max(0, count - selected.length);
  const mockFill = missingCount > 0 ? buildSectionMockQuestions(sectionKey, missingCount) : [];

  return {
    sectionKey,
    title,
    questionCount: count,
    durationMinutes: modeSection?.durationMinutes ?? Math.ceil(count),
    questions: [...selected, ...mockFill],
    usesMockFill: mockFill.length > 0,
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
    usesMockFill: sections.some((section) => section.usesMockFill),
  };
}
