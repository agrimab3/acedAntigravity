import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  actTopics,
  practiceAnswers,
  practiceSessions,
  questionSets,
  questions,
} from "@/db/schema";
import { getAuthSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { selectMissedReviewRecords } from "@/lib/practice-review";

const retrySchema = z.object({
  questionId: z.string().uuid(),
});

const SECTION_KEYS = new Set(["english", "math", "reading", "science"]);

export async function GET(request: Request) {
  const auth = await getAuthSession();
  const userId = auth?.user?.id;
  const db = getDb();

  if (!userId || !db) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  const rawSection = url.searchParams.get("section");
  const section = rawSection && SECTION_KEYS.has(rawSection) ? rawSection : null;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      answerId: practiceAnswers.id,
      userId: practiceAnswers.userId,
      sessionId: practiceAnswers.sessionId,
      questionId: practiceAnswers.questionId,
      selectedAnswer: practiceAnswers.selectedAnswer,
      isCorrect: practiceAnswers.isCorrect,
      submittedAt: practiceAnswers.submittedAt,
      section: questions.sectionKey,
      topic: actTopics.name,
      difficulty: questions.difficulty,
      prompt: questions.prompt,
      passage: questions.passage,
      questionSetContent: questionSets.content,
      choices: questions.choices,
      correctAnswer: questions.correctAnswer,
      explanation: questions.explanation,
      usageScope: questions.usageScope,
      status: questions.status,
    })
    .from(practiceAnswers)
    .innerJoin(questions, eq(practiceAnswers.questionId, questions.id))
    .innerJoin(actTopics, eq(questions.topicId, actTopics.id))
    .leftJoin(questionSets, eq(questions.questionSetId, questionSets.id))
    .where(
      and(
        eq(practiceAnswers.userId, userId),
        eq(questions.usageScope, "practice"),
        eq(questions.status, "published")
      )
    )
    .orderBy(desc(practiceAnswers.submittedAt));

  const eligibleRows = rows.filter((row) => row.status === "published");
  const selected = selectMissedReviewRecords({
    records: eligibleRows.map((row) => ({
      userId: row.userId,
      sessionId: row.sessionId,
      questionId: row.questionId,
      isCorrect: row.isCorrect,
      submittedAt: row.submittedAt,
      usageScope: row.usageScope,
      section: row.section,
    })),
    userId,
    sessionId,
    section,
    since,
  });

  const selectedKey = new Set(
    selected.map((row) => `${row.sessionId}:${row.questionId}:${row.submittedAt.toISOString()}`)
  );

  const questionNumberByAnswerId = new Map<string, number>();
  const answersBySession = new Map<string, typeof eligibleRows>();
  for (const row of eligibleRows) {
    const bucket = answersBySession.get(row.sessionId) ?? [];
    bucket.push(row);
    answersBySession.set(row.sessionId, bucket);
  }
  for (const sessionRows of answersBySession.values()) {
    sessionRows
      .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime())
      .forEach((row, index) => questionNumberByAnswerId.set(row.answerId, index + 1));
  }

  const items = eligibleRows
    .filter((row) =>
      selectedKey.has(`${row.sessionId}:${row.questionId}:${row.submittedAt.toISOString()}`)
    )
    .map((row) => ({
      answerId: row.answerId,
      sessionId: row.sessionId,
      questionId: row.questionId,
      section: row.section,
      topic: row.topic,
      difficulty: row.difficulty,
      submittedAt: row.submittedAt.toISOString(),
      questionNumber: questionNumberByAnswerId.get(row.answerId) ?? 1,
      selectedAnswer: row.selectedAnswer,
      correctAnswer: row.correctAnswer,
      question: {
        passage: row.passage ?? row.questionSetContent ?? null,
        question_text: row.prompt,
        choices: row.choices,
        explanation: row.explanation,
      },
    }));

  return NextResponse.json({
    items,
    scope: sessionId ? "session" : "last30",
    section,
    sessionId,
  });
}

export async function POST(request: Request) {
  const parsed = retrySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid retry request." }, { status: 400 });
  }

  const auth = await getAuthSession();
  const userId = auth?.user?.id;
  const db = getDb();

  if (!userId || !db) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const [question] = await db
    .select({
      id: questions.id,
      sectionKey: questions.sectionKey,
      topicId: questions.topicId,
      usageScope: questions.usageScope,
      status: questions.status,
    })
    .from(questions)
    .where(eq(questions.id, parsed.data.questionId))
    .limit(1);

  if (
    !question ||
    question.status !== "published" ||
    question.usageScope !== "practice"
  ) {
    return NextResponse.json({ error: "Question is not available for practice." }, { status: 404 });
  }

  const [practiceSession] = await db
    .insert(practiceSessions)
    .values({
      userId,
      sectionKey: question.sectionKey,
      topicId: question.topicId,
      questionCount: 1,
    })
    .returning({ id: practiceSessions.id });

  return NextResponse.json({ sessionId: practiceSession.id });
}
