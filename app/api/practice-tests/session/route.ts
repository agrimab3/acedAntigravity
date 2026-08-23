import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import {
  practiceTestAnswers,
  practiceTestSections,
  practiceTestSessions,
  questionExposures,
  type PracticeTestQuestionSnapshot,
} from "@/db/schema";
import { getAuthSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { PracticeTestMode } from "@/lib/practice-tests";
import { buildPracticeTestPayload, getPracticeTestMode } from "@/lib/practice-test-engine";

const createSchema = z.object({
  mode: z.string().trim().min(1),
});

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid practice test request." }, { status: 400 });
  }

  const mode = getPracticeTestMode(parsed.data.mode);

  if (!mode) {
    return NextResponse.json({ error: "Unsupported practice test mode." }, { status: 400 });
  }

  const session = await getAuthSession();
  const userId = session?.user?.id ?? null;
  const db = getDb();

  const payload = await buildPracticeTestPayload({
    db,
    userId,
    mode,
  });

  if (!db || !userId) {
    return NextResponse.json({
      persisted: false,
      sessionId: null,
      mode: mode.key,
      format: mode.format,
      title: mode.title,
      usesMockFill: payload.usesMockFill,
      sections: payload.sections,
    });
  }

  const now = new Date();
  const totalQuestionCount = payload.sections.reduce((sum, section) => sum + section.questions.length, 0);

  const [sessionRow] = await db
    .insert(practiceTestSessions)
    .values({
      userId,
      modeKey: mode.key,
      format: mode.format,
      status: "in_progress",
      scienceIncluded: mode.sections.some(
        (section: PracticeTestMode["sections"][number]) => section.key === "science"
      ),
      totalQuestionCount,
      startedAt: now,
      updatedAt: now,
    })
    .returning({ id: practiceTestSessions.id });

  const sessionId = sessionRow.id;
  const sectionRows = await db
    .insert(practiceTestSections)
    .values(
      payload.sections.map((section, index) => ({
        sessionId,
        sectionKey: section.sectionKey,
        sectionOrder: index,
        title: section.title,
        questionCount: section.questions.length,
        timeLimitSeconds: section.durationMinutes * 60,
        startedAt: now,
        updatedAt: now,
      }))
    )
    .returning({
      id: practiceTestSections.id,
      sectionKey: practiceTestSections.sectionKey,
      sectionOrder: practiceTestSections.sectionOrder,
    });

  const sectionIdByOrder = new Map(sectionRows.map((row) => [row.sectionOrder, row.id]));

  await db.insert(practiceTestAnswers).values(
    payload.sections.flatMap((section, sectionIndex) =>
      section.questions.map((question, questionIndex) => ({
        sessionId,
        sectionRunId: sectionIdByOrder.get(sectionIndex)!,
        userId,
        questionId: question.id.startsWith("mock-") || question.id.startsWith("section-") ? null : question.id,
        questionOrder: questionIndex,
        topicName: question.topic,
        correctAnswer: question.correct_answer,
        questionSnapshot: {
          id: question.id,
          section: question.section,
          topic: question.topic,
          difficulty: question.difficulty,
          passage: "passage" in question ? question.passage ?? null : null,
          question_text: question.question_text,
          choices: question.choices,
          correct_answer: question.correct_answer,
          explanation: question.explanation,
        } satisfies PracticeTestQuestionSnapshot,
        createdAt: now,
        updatedAt: now,
      }))
    )
  );

  const realQuestionIds = Array.from(
    new Set(
      payload.sections.flatMap((section) =>
        section.questions
          .filter(
            (question) =>
              !question.id.startsWith("mock-") && !question.id.startsWith("section-")
          )
          .map((question) => question.id)
      )
    )
  );

  if (realQuestionIds.length > 0) {
    await Promise.all(
      realQuestionIds.map((questionId) =>
        db
          .insert(questionExposures)
          .values({
            userId,
            questionId,
            timesSeen: 1,
            firstSeenAt: now,
            lastSeenAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [questionExposures.userId, questionExposures.questionId],
            set: {
              timesSeen: sql`${questionExposures.timesSeen} + 1`,
              lastSeenAt: now,
              updatedAt: now,
            },
          })
      )
    );
  }

  return NextResponse.json({
    persisted: true,
    sessionId,
    mode: mode.key,
    format: mode.format,
    title: mode.title,
    usesMockFill: payload.usesMockFill,
    sections: payload.sections.map((section, index) => ({
      ...section,
      sectionRunId: sectionIdByOrder.get(index) ?? null,
    })),
  });
}
