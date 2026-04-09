import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { actTopics, questionExposures, questions } from "@/db/schema";
import { getAuthSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildMockQuestions, type PracticeQuestion } from "@/lib/mock-questions";
import { normalizeQuestionRow, type NormalizedQuestionRow } from "@/lib/question-utils";
import { SECTION_TESTS } from "@/lib/practice-tests";

const searchSchema = z.object({
  mode: z.enum(["english", "math", "reading", "science"]),
});

function buildSectionMockQuestions(
  section: "english" | "math" | "reading" | "science",
  limit: number
) {
  const pool = SECTION_TESTS.find((mode) => mode.key === section)?.sections ?? [];
  const topicRotation =
    pool.length > 0
      ? pool.map((entry) => entry.label)
      : ["Core Skills"];

  const mocks: PracticeQuestion[] = [];
  let index = 0;

  while (mocks.length < limit) {
    const topicName = topicRotation[index % topicRotation.length] ?? "Core Skills";
    const batch = buildMockQuestions(section, topicName, Math.min(10, limit - mocks.length), "medium");
    batch.forEach((question, batchIndex) => {
      mocks.push({
        ...question,
        id: `section-${section}-mock-${mocks.length + batchIndex + 1}`,
      });
    });
    index += 1;
  }

  return mocks.slice(0, limit);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = searchSchema.safeParse({
    mode: url.searchParams.get("mode"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid practice test mode." }, { status: 400 });
  }

  const mode = parsed.data.mode;
  const config = SECTION_TESTS.find((entry) => entry.key === mode);

  if (!config) {
    return NextResponse.json({ error: "Unsupported practice test mode." }, { status: 400 });
  }

  const db = getDb();
  const session = await getAuthSession();
  const userId = session?.user?.id ?? null;

  if (!db) {
    return NextResponse.json({
      mode: config.key,
      title: config.title,
      sectionKey: config.sectionKey,
      questionCount: config.questionCount,
      durationMinutes: config.durationMinutes,
      questions: buildSectionMockQuestions(mode, config.questionCount),
      source: "mock",
      usesMockFill: true,
    });
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
        .where(and(eq(questions.status, "published"), eq(actTopics.sectionKey, mode), eq(actTopics.isActive, true)))
        .orderBy(sql`coalesce(${questionExposures.timesSeen}, 0) asc`, sql`random()`)
        .limit(config.questionCount * 5)
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
        .where(and(eq(questions.status, "published"), eq(actTopics.sectionKey, mode), eq(actTopics.isActive, true)))
        .orderBy(sql`random()`)
        .limit(config.questionCount * 5);

  const normalized = new Map<string, NormalizedQuestionRow>();

  rows.forEach((row) => {
    const question = normalizeQuestionRow(row);
    if (question && !normalized.has(question.id)) {
      normalized.set(question.id, question);
    }
  });

  const selectedQuestions = Array.from(normalized.values()).slice(0, config.questionCount);
  const missingCount = Math.max(0, config.questionCount - selectedQuestions.length);
  const mockFill = missingCount > 0 ? buildSectionMockQuestions(mode, missingCount) : [];

  return NextResponse.json({
    mode: config.key,
    title: config.title,
    sectionKey: config.sectionKey,
    questionCount: config.questionCount,
    durationMinutes: config.durationMinutes,
    questions: [...selectedQuestions, ...mockFill],
    source: selectedQuestions.length > 0 ? "database" : "mock",
    usesMockFill: mockFill.length > 0,
    availableCount: selectedQuestions.length,
  });
}
