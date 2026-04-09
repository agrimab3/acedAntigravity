import { and, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  actTopics,
  practiceTestAnswers,
  practiceTestSections,
  practiceTestSessions,
  questionExposures,
  questions,
  topicMastery,
  topicSkillState,
} from "@/db/schema";
import { getAuthSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  estimatePracticeTestCompositeScore,
  estimatePracticeTestSectionScore,
  summarizeCompositePacing,
  summarizePracticeTestPacing,
} from "@/lib/practice-test-score";
import { buildPracticeTestRemediationPlan } from "@/lib/practice-test-remediation";

const completeSchema = z.object({
  durationSeconds: z.coerce.number().int().min(0).default(0),
  sections: z.array(
    z.object({
      sectionRunId: z.string().uuid(),
      sectionKey: z.enum(["english", "math", "reading", "science"]),
      durationSeconds: z.coerce.number().int().min(0).default(0),
      answers: z.array(
        z.object({
          questionOrder: z.coerce.number().int().min(0),
          selectedAnswer: z.enum(["A", "B", "C", "D"]).nullable(),
          flagged: z.boolean().default(false),
          timeSpentSeconds: z.coerce.number().int().min(0).default(0),
        })
      ),
    })
  ),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  const parsed = completeSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid practice test completion payload." }, { status: 400 });
  }

  const { sessionId } = await context.params;
  const session = await getAuthSession();
  const userId = session?.user?.id ?? null;
  const db = getDb();

  if (!db || !userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const [sessionRow] = await db
    .select({
      id: practiceTestSessions.id,
      modeKey: practiceTestSessions.modeKey,
      format: practiceTestSessions.format,
    })
    .from(practiceTestSessions)
    .where(and(eq(practiceTestSessions.id, sessionId), eq(practiceTestSessions.userId, userId)))
    .limit(1);

  if (!sessionRow) {
    return NextResponse.json({ error: "Practice test session not found." }, { status: 404 });
  }

  const storedSections = await db
    .select({
      id: practiceTestSections.id,
      sectionKey: practiceTestSections.sectionKey,
      title: practiceTestSections.title,
      questionCount: practiceTestSections.questionCount,
      timeLimitSeconds: practiceTestSections.timeLimitSeconds,
      sectionOrder: practiceTestSections.sectionOrder,
    })
    .from(practiceTestSections)
    .where(eq(practiceTestSections.sessionId, sessionId));

  const storedSectionIds = new Set(storedSections.map((section) => section.id));
  const payloadSectionIds = new Set(parsed.data.sections.map((section) => section.sectionRunId));
  const sectionOrderById = new Map(storedSections.map((section) => [section.id, section.sectionOrder]));

  for (const id of payloadSectionIds) {
    if (!storedSectionIds.has(id)) {
      return NextResponse.json({ error: "Section payload mismatch." }, { status: 400 });
    }
  }

  const sectionReports: Array<{
    sectionRunId: string;
    sectionKey: string;
    title: string;
    questionCount: number;
    answeredCount: number;
    correctCount: number;
    accuracyPct: number;
    estimatedScore: number;
    timeLimitSeconds: number;
    durationSeconds: number;
    pacingSummary: ReturnType<typeof summarizePracticeTestPacing>;
  }> = [];

  const answeredRealQuestions: Array<{ questionId: string; isCorrect: boolean }> = [];

  for (const submittedSection of parsed.data.sections) {
    const storedSection = storedSections.find((section) => section.id === submittedSection.sectionRunId);

    if (!storedSection) {
      continue;
    }

    const storedAnswers = await db
      .select({
        id: practiceTestAnswers.id,
        questionId: practiceTestAnswers.questionId,
        questionOrder: practiceTestAnswers.questionOrder,
        correctAnswer: practiceTestAnswers.correctAnswer,
        topicName: practiceTestAnswers.topicName,
        questionSnapshot: practiceTestAnswers.questionSnapshot,
      })
      .from(practiceTestAnswers)
      .where(eq(practiceTestAnswers.sectionRunId, submittedSection.sectionRunId));

    const answerByOrder = new Map(storedAnswers.map((answer) => [answer.questionOrder, answer]));
    const now = new Date();

    for (const answer of submittedSection.answers) {
      const storedAnswer = answerByOrder.get(answer.questionOrder);

      if (!storedAnswer) {
        continue;
      }

      const isCorrect =
        answer.selectedAnswer === null ? null : answer.selectedAnswer === storedAnswer.correctAnswer;

      await db
        .update(practiceTestAnswers)
        .set({
          selectedAnswer: answer.selectedAnswer,
          isCorrect,
          flagged: answer.flagged,
          timeSpentSeconds: answer.timeSpentSeconds,
          answeredAt: answer.selectedAnswer ? now : null,
          updatedAt: now,
        })
        .where(eq(practiceTestAnswers.id, storedAnswer.id));

      if (storedAnswer.questionId && isCorrect !== null) {
        answeredRealQuestions.push({
          questionId: storedAnswer.questionId,
          isCorrect,
        });
      }
    }

    const answeredCount = submittedSection.answers.filter((answer) => answer.selectedAnswer !== null).length;
    const correctCount = submittedSection.answers.filter((answer) => {
      const storedAnswer = answerByOrder.get(answer.questionOrder);
      return storedAnswer && answer.selectedAnswer === storedAnswer.correctAnswer;
    }).length;
    const accuracyPct =
      storedSection.questionCount > 0
        ? Math.round((correctCount / storedSection.questionCount) * 100)
        : 0;
    const estimatedScore = estimatePracticeTestSectionScore(
      storedSection.sectionKey as "english" | "math" | "reading" | "science",
      correctCount,
      storedSection.questionCount
    );
    const pacingSummary = summarizePracticeTestPacing({
      sectionKey: storedSection.sectionKey as "english" | "math" | "reading" | "science",
      questionCount: storedSection.questionCount,
      answeredCount,
      durationSeconds: submittedSection.durationSeconds,
      timeLimitSeconds: storedSection.timeLimitSeconds,
    });

    await db
      .update(practiceTestSections)
      .set({
        answeredCount,
        correctCount,
        accuracyPct,
        estimatedScore,
        durationSeconds: submittedSection.durationSeconds,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(practiceTestSections.id, submittedSection.sectionRunId));

    sectionReports.push({
      sectionRunId: submittedSection.sectionRunId,
      sectionKey: storedSection.sectionKey,
      title: storedSection.title,
      questionCount: storedSection.questionCount,
      answeredCount,
      correctCount,
      accuracyPct,
      estimatedScore,
      timeLimitSeconds: storedSection.timeLimitSeconds,
      durationSeconds: submittedSection.durationSeconds,
      pacingSummary,
    });
  }

  if (answeredRealQuestions.length > 0) {
    const now = new Date();

    await Promise.all(
      answeredRealQuestions.map((answer) =>
        db
          .insert(questionExposures)
          .values({
            userId,
            questionId: answer.questionId,
            timesSeen: 1,
            timesCorrect: answer.isCorrect ? 1 : 0,
            timesIncorrect: answer.isCorrect ? 0 : 1,
            firstSeenAt: now,
            lastSeenAt: now,
            lastAnsweredAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [questionExposures.userId, questionExposures.questionId],
            set: {
              timesSeen: sql`${questionExposures.timesSeen} + 1`,
              timesCorrect: sql`${questionExposures.timesCorrect} + ${answer.isCorrect ? 1 : 0}`,
              timesIncorrect: sql`${questionExposures.timesIncorrect} + ${answer.isCorrect ? 0 : 1}`,
              lastSeenAt: now,
              lastAnsweredAt: now,
              updatedAt: now,
            },
          })
      )
    );

    const realQuestionIds = answeredRealQuestions.map((answer) => answer.questionId);
    const questionRows = await db
      .select({
        questionId: questions.id,
        topicId: questions.topicId,
      })
      .from(questions)
      .where(inArray(questions.id, realQuestionIds));

    const topicIdByQuestionId = new Map(questionRows.map((row) => [row.questionId, row.topicId]));
    const topicTotals = new Map<string, { attempts: number; correct: number }>();

    answeredRealQuestions.forEach((answer) => {
      const topicId = topicIdByQuestionId.get(answer.questionId);
      if (!topicId) return;
      const current = topicTotals.get(topicId) ?? { attempts: 0, correct: 0 };
      current.attempts += 1;
      current.correct += answer.isCorrect ? 1 : 0;
      topicTotals.set(topicId, current);
    });

    const existingMasteryRows = topicTotals.size
      ? await db
          .select({
            topicId: topicMastery.topicId,
            correctCount: topicMastery.correctCount,
            attemptCount: topicMastery.attemptCount,
          })
          .from(topicMastery)
          .where(and(eq(topicMastery.userId, userId), inArray(topicMastery.topicId, Array.from(topicTotals.keys()))))
      : [];

    const existingByTopicId = new Map(existingMasteryRows.map((row) => [row.topicId, row]));

    await Promise.all(
      Array.from(topicTotals.entries()).map(([topicId, totals]) => {
        const existing = existingByTopicId.get(topicId);
        const nextCorrectCount = (existing?.correctCount ?? 0) + totals.correct;
        const nextAttemptCount = (existing?.attemptCount ?? 0) + totals.attempts;
        const masteryPct = Math.round((nextCorrectCount / Math.max(nextAttemptCount, 1)) * 100);

        return db
          .insert(topicMastery)
          .values({
            userId,
            topicId,
            correctCount: nextCorrectCount,
            attemptCount: nextAttemptCount,
            masteryPct,
            lastPracticedAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [topicMastery.userId, topicMastery.topicId],
            set: {
              correctCount: nextCorrectCount,
              attemptCount: nextAttemptCount,
              masteryPct,
              lastPracticedAt: now,
              updatedAt: now,
            },
          });
      })
    );
  }

  const answeredCount = sectionReports.reduce((sum, section) => sum + section.answeredCount, 0);
  const correctCount = sectionReports.reduce((sum, section) => sum + section.correctCount, 0);
  const totalQuestionCount = sectionReports.reduce((sum, section) => sum + section.questionCount, 0);
  const accuracyPct = totalQuestionCount > 0 ? Math.round((correctCount / totalQuestionCount) * 100) : 0;
  const compositeEstimatedScore = estimatePracticeTestCompositeScore(
    sectionReports.map((section) => section.estimatedScore)
  );
  const overallPacing = summarizeCompositePacing(
    sectionReports.map((section) => section.pacingSummary)
  );

  await db
    .update(practiceTestSessions)
    .set({
      status: "completed",
      answeredCount,
      correctCount,
      accuracyPct,
      compositeEstimatedScore,
      durationSeconds: parsed.data.durationSeconds,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(practiceTestSessions.id, sessionId));

  const storedAnswerRows = await db
    .select({
      sectionRunId: practiceTestAnswers.sectionRunId,
      sectionKey: practiceTestSections.sectionKey,
      title: practiceTestSections.title,
      questionOrder: practiceTestAnswers.questionOrder,
      topicName: practiceTestAnswers.topicName,
      selectedAnswer: practiceTestAnswers.selectedAnswer,
      correctAnswer: practiceTestAnswers.correctAnswer,
      isCorrect: practiceTestAnswers.isCorrect,
      flagged: practiceTestAnswers.flagged,
      questionSnapshot: practiceTestAnswers.questionSnapshot,
    })
    .from(practiceTestAnswers)
    .innerJoin(practiceTestSections, eq(practiceTestAnswers.sectionRunId, practiceTestSections.id))
    .where(eq(practiceTestAnswers.sessionId, sessionId));

  const remediationTopicBaseSignals = Array.from(
    storedAnswerRows.reduce((map, answer) => {
      const key = `${answer.sectionKey}:${answer.topicName}`;
      const current = map.get(key) ?? {
        sectionKey: answer.sectionKey as "english" | "math" | "reading" | "science",
        sectionTitle: answer.title,
        topicName: answer.topicName,
        misses: 0,
        attempts: 0,
        unansweredCount: 0,
        flaggedCount: 0,
      };

      if (answer.selectedAnswer === null) {
        current.unansweredCount += 1;
      } else {
        current.attempts += 1;
        if (answer.isCorrect === false) {
          current.misses += 1;
        }
      }

      if (answer.flagged) {
        current.flaggedCount += 1;
      }

      map.set(key, current);
      return map;
    }, new Map<string, {
      sectionKey: "english" | "math" | "reading" | "science";
      sectionTitle: string;
      topicName: string;
      misses: number;
      attempts: number;
      unansweredCount: number;
      flaggedCount: number;
    }>())
  ).map(([, value]) => value);

  const missedQuestions = storedAnswerRows
    .filter((answer) => answer.selectedAnswer && answer.isCorrect === false)
    .map((answer) => ({
      sectionKey: answer.sectionKey,
      sectionTitle: answer.title,
      questionOrder: answer.questionOrder,
      topicName: answer.topicName,
      selectedAnswer: answer.selectedAnswer,
      correctAnswer: answer.correctAnswer,
      flagged: answer.flagged,
      question: answer.questionSnapshot,
    }));

  const missedTopicMap = new Map<string, { sectionKey: string; topicName: string; misses: number }>();

  missedQuestions.forEach((question) => {
    const key = `${question.sectionKey}:${question.topicName}`;
    const current = missedTopicMap.get(key) ?? {
      sectionKey: question.sectionKey,
      topicName: question.topicName,
      misses: 0,
    };
    current.misses += 1;
    missedTopicMap.set(key, current);
  });

  const missedTopicKeys = new Set(
    Array.from(missedTopicMap.values()).map((item) => `${item.sectionKey}:${item.topicName}`)
  );
  const remediationTopicSignals =
    missedTopicKeys.size > 0
      ? remediationTopicBaseSignals.filter((signal) =>
          missedTopicKeys.has(`${signal.sectionKey}:${signal.topicName}`)
        )
      : [];

  const activeTopics = remediationTopicSignals.length
    ? await db
        .select({
          id: actTopics.id,
          sectionKey: actTopics.sectionKey,
          name: actTopics.name,
        })
        .from(actTopics)
        .where(eq(actTopics.isActive, true))
    : [];

  const topicIdByKey = new Map(
    activeTopics.map((topic) => [`${topic.sectionKey}:${topic.name}`, topic.id] as const)
  );
  const remediationTopicIds = remediationTopicSignals
    .map((signal) => topicIdByKey.get(`${signal.sectionKey}:${signal.topicName}`))
    .filter((value): value is string => Boolean(value));

  const masteryRows = remediationTopicIds.length
    ? await db
        .select({
          topicId: topicMastery.topicId,
          masteryPct: topicMastery.masteryPct,
          attemptCount: topicMastery.attemptCount,
        })
        .from(topicMastery)
        .where(and(eq(topicMastery.userId, userId), inArray(topicMastery.topicId, remediationTopicIds)))
    : [];

  const masteryByTopicId = new Map(
    masteryRows.map((row) => [
      row.topicId,
      {
        masteryPct: row.masteryPct,
        attemptCount: row.attemptCount,
      },
    ] as const)
  );

  const skillRows = remediationTopicIds.length
    ? await db
        .select({
          topicId: topicSkillState.topicId,
          rollingAccuracyPct: topicSkillState.rollingAccuracyPct,
          currentDifficulty: topicSkillState.currentDifficulty,
          totalAnswered: topicSkillState.totalAnswered,
        })
        .from(topicSkillState)
        .where(
          and(eq(topicSkillState.userId, userId), inArray(topicSkillState.topicId, remediationTopicIds))
        )
    : [];

  const skillByTopicId = new Map(
    skillRows.map((row) => [
      row.topicId,
      {
        rollingAccuracyPct: row.rollingAccuracyPct,
        currentDifficulty: row.currentDifficulty,
        totalAnswered: row.totalAnswered,
      },
    ] as const)
  );

  const remediationPlan = buildPracticeTestRemediationPlan({
    topicSignals: remediationTopicSignals.map((signal) => {
      const topicId = topicIdByKey.get(`${signal.sectionKey}:${signal.topicName}`) ?? null;
      const mastery = topicId ? masteryByTopicId.get(topicId) : null;
      const skill = topicId ? skillByTopicId.get(topicId) : null;

      return {
        ...signal,
        masteryPct: mastery?.masteryPct ?? null,
        rollingAccuracyPct: skill?.rollingAccuracyPct ?? null,
        currentDifficulty: skill?.currentDifficulty ?? null,
        totalAnswered: Math.max(skill?.totalAnswered ?? 0, mastery?.attemptCount ?? 0),
      };
    }),
    sectionSignals: sectionReports.map((section) => ({
      sectionKey: section.sectionKey as "english" | "math" | "reading" | "science",
      title: section.title,
      accuracyPct: section.accuracyPct,
      answeredCount: section.answeredCount,
      questionCount: section.questionCount,
      pacingTone: section.pacingSummary.tone,
    })),
  });

  return NextResponse.json({
    persisted: true,
    sessionId,
    modeKey: sessionRow.modeKey,
    format: sessionRow.format,
    totalQuestionCount,
    answeredCount,
    correctCount,
    accuracyPct,
    compositeEstimatedScore,
    overallPacing,
    sectionReports: sectionReports.sort(
      (a, b) =>
        (sectionOrderById.get(a.sectionRunId) ?? Number.MAX_SAFE_INTEGER) -
        (sectionOrderById.get(b.sectionRunId) ?? Number.MAX_SAFE_INTEGER)
    ),
    remediationPlan,
    missedAnalysis: Array.from(missedTopicMap.values()).sort((a, b) => b.misses - a.misses),
    missedQuestions,
  });
}
