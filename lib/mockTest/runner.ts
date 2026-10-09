import { and, asc, eq, isNotNull, ne, sql } from "drizzle-orm";
import {
  actTopics,
  mockRegistrations,
  mockTestAnswers,
  mockTestFormQuestions,
  mockTestForms,
  mockTestOpsEvents,
  mockTestSectionRuns,
  mockTestSessions,
  mockTests,
  questionSets,
  questions,
} from "@/db/schema";
import { getDb } from "@/lib/db";
import { getMockTestServerNow } from "@/lib/mockTest/devClock";
import { getMockTestAuthMode, getMockTestPaymentMode } from "@/lib/mockTest/mode";
import {
  MOCK_SECTIONS,
  NEXT_MOCK,
  getMockBreakSecondsAfter,
  getMockTransitionSecondsAfter,
  isMockSignupClosedForZone,
} from "@/lib/mockTests";

export const MOCK_SECTION_ORDER = ["english", "math", "reading", "science"] as const;

export function canBypassMockEventWindow() {
  return (
    process.env.NODE_ENV !== "production" &&
    getMockTestAuthMode() === "test" &&
    getMockTestPaymentMode() === "test"
  );
}

function getLocalDate(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function getMockStartWindowState(
  timeZone: string,
  now = new Date(),
  startOverrideUntil?: Date | null
) {
  if (startOverrideUntil && startOverrideUntil.getTime() >= now.getTime()) {
    return { allowed: true, reason: "admin_override" as const };
  }

  if (canBypassMockEventWindow()) {
    return { allowed: true, reason: "test_mode" as const };
  }

  const localDate = getLocalDate(timeZone, now);
  if (localDate < NEXT_MOCK.testDate) {
    return { allowed: false, reason: "not_open_yet" as const };
  }
  if (localDate > NEXT_MOCK.testDate) {
    return { allowed: false, reason: "event_over" as const };
  }
  if (isMockSignupClosedForZone(timeZone, now)) {
    return { allowed: false, reason: "past_start_cutoff" as const };
  }
  return { allowed: true, reason: "open" as const };
}

export function getMockSectionConfig(sectionOrder: number) {
  const config = MOCK_SECTIONS[sectionOrder];
  if (!config) return null;
  return { ...config, sectionOrder };
}

export function getMockSectionTimeLimitSeconds(sectionOrder: number, formVersion?: string | null) {
  const config = getMockSectionConfig(sectionOrder);
  if (!config) return null;

  if (canBypassMockEventWindow() && formVersion === "DEV") {
    return 90;
  }

  return config.durationMinutes * 60;
}

export function getMockBreakDurationSeconds(
  sectionKey: (typeof MOCK_SECTION_ORDER)[number],
  devOverrideSeconds?: number | null
) {
  const configured = getMockBreakSecondsAfter(sectionKey);
  if (configured === null) return null;

  if (
    canBypassMockEventWindow() &&
    devOverrideSeconds !== null &&
    devOverrideSeconds !== undefined &&
    Number.isFinite(devOverrideSeconds) &&
    devOverrideSeconds >= 1
  ) {
    return Math.floor(devOverrideSeconds);
  }

  return configured;
}

export function getMockTransitionDurationSeconds(
  sectionKey: (typeof MOCK_SECTION_ORDER)[number],
  devOverrideSeconds?: number | null
) {
  const configured = getMockTransitionSecondsAfter(sectionKey);
  if (configured === null) return null;

  if (
    canBypassMockEventWindow() &&
    devOverrideSeconds !== null &&
    devOverrideSeconds !== undefined &&
    Number.isFinite(devOverrideSeconds) &&
    devOverrideSeconds >= 1
  ) {
    return Math.floor(devOverrideSeconds);
  }

  return configured;
}

export async function advanceMockBreak(
  sessionId: string,
  registrationId: string,
  options: { forceStart?: boolean; now?: Date } = {}
) {
  const db = getDb();
  if (!db) throw new Error("Database unavailable.");

  const now = options.now ?? getMockTestServerNow();

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from mock_test_sessions where id = ${sessionId} for update`
    );

    const [session] = await tx
      .select({
        id: mockTestSessions.id,
        formId: mockTestSessions.formId,
        status: mockTestSessions.status,
        currentSectionOrder: mockTestSessions.currentSectionOrder,
        currentBreakAfter: mockTestSessions.currentBreakAfter,
        breakEndsAt: mockTestSessions.breakEndsAt,
        mockTestId: mockRegistrations.mockTestId,
      })
      .from(mockTestSessions)
      .innerJoin(
        mockRegistrations,
        eq(mockTestSessions.registrationId, mockRegistrations.id)
      )
      .where(
        and(
          eq(mockTestSessions.id, sessionId),
          eq(mockTestSessions.registrationId, registrationId)
        )
      )
      .limit(1);

    if (
      !session ||
      session.status === "completed" ||
      !session.currentBreakAfter ||
      !session.breakEndsAt
    ) {
      return { advanced: false as const };
    }

    const isRealBreak = session.currentBreakAfter === "math";
    if (
      now.getTime() < session.breakEndsAt.getTime() &&
      (!options.forceStart || !isRealBreak)
    ) {
      return { advanced: false as const };
    }

    const nextOrder = session.currentSectionOrder + 1;
    const nextSection = getMockSectionConfig(nextOrder);
    if (!nextSection) {
      throw new Error("Break state has no next section.");
    }

    const [nextRun] = await tx
      .select({
        id: mockTestSectionRuns.id,
        startedAt: mockTestSectionRuns.startedAt,
      })
      .from(mockTestSectionRuns)
      .where(
        and(
          eq(mockTestSectionRuns.sessionId, session.id),
          eq(mockTestSectionRuns.sectionOrder, nextOrder)
        )
      )
      .limit(1);

    if (!nextRun) throw new Error("Next section run is missing.");

    const [form] = await tx
      .select({ version: mockTestForms.version })
      .from(mockTestForms)
      .where(eq(mockTestForms.id, session.formId))
      .limit(1);

    if (!nextRun.startedAt) {
      const timeLimitSeconds = getMockSectionTimeLimitSeconds(
        nextOrder,
        form?.version
      );
      if (!timeLimitSeconds) throw new Error("Next section time limit is missing.");

      const startedAt = new Date(
        Math.min(now.getTime(), session.breakEndsAt.getTime())
      );

      await tx
        .update(mockTestSectionRuns)
        .set({
          startedAt,
          deadlineAt: new Date(startedAt.getTime() + timeLimitSeconds * 1000),
          updatedAt: now,
        })
        .where(eq(mockTestSectionRuns.id, nextRun.id));
    }

    if (isRealBreak) {
      const endedAt = new Date(
        Math.min(now.getTime(), session.breakEndsAt.getTime())
      );
      await tx.insert(mockTestOpsEvents).values({
        mockTestId: session.mockTestId,
        registrationId,
        sessionId: session.id,
        sectionKey: "math",
        kind: "break_ended",
        details: {
          endedAt: endedAt.toISOString(),
          startedReadingEarly: endedAt.getTime() < session.breakEndsAt.getTime(),
        },
        createdAt: now,
      });
    }

    await tx
      .update(mockTestSessions)
      .set({
        currentSectionOrder: nextOrder,
        currentBreakAfter: null,
        breakStartedAt: null,
        breakEndsAt: null,
        updatedAt: now,
      })
      .where(eq(mockTestSessions.id, session.id));

    return { advanced: true as const };
  });
}

export async function getPaidMockRegistration(userId: string) {
  const db = getDb();
  if (!db) return null;

  const [registration] = await db
    .select({
      id: mockRegistrations.id,
      mockTestId: mockRegistrations.mockTestId,
      timeZone: mockRegistrations.timeZone,
      paidAt: mockRegistrations.paidAt,
      startOverrideUntil: mockRegistrations.startOverrideUntil,
      startedAt: mockRegistrations.startedAt,
      finishedAt: mockRegistrations.finishedAt,
      englishScore: mockRegistrations.englishScore,
      mathScore: mockRegistrations.mathScore,
      readingScore: mockRegistrations.readingScore,
      scienceScore: mockRegistrations.scienceScore,
      composite: mockRegistrations.composite,
      percentile: mockRegistrations.percentile,
    })
    .from(mockRegistrations)
    .innerJoin(mockTests, eq(mockRegistrations.mockTestId, mockTests.id))
    .where(
      and(
        eq(mockTests.slug, NEXT_MOCK.mockTestSlug),
        eq(mockRegistrations.userId, userId),
        isNotNull(mockRegistrations.paidAt)
      )
    )
    .limit(1);

  return registration ?? null;
}

export async function getLockedMockForm(mockTestId: string) {
  const db = getDb();
  if (!db) return null;

  if (canBypassMockEventWindow()) {
    const [devForm] = await db
      .select({ id: mockTestForms.id, version: mockTestForms.version })
      .from(mockTestForms)
      .where(
        and(
          eq(mockTestForms.mockTestId, mockTestId),
          eq(mockTestForms.status, "locked"),
          eq(mockTestForms.version, "DEV")
        )
      )
      .limit(1);

    if (devForm) return devForm;
  }

  const [form] = await db
    .select({ id: mockTestForms.id, version: mockTestForms.version })
    .from(mockTestForms)
    .where(
      and(
        eq(mockTestForms.mockTestId, mockTestId),
        eq(mockTestForms.status, "locked"),
        ne(mockTestForms.version, "DEV")
      )
    )
    .orderBy(asc(mockTestForms.version))
    .limit(1);

  return form ?? null;
}

export async function loadMockSessionPayload(sessionId: string, registrationId: string) {
  const db = getDb();
  if (!db) throw new Error("Database unavailable.");

  const now = getMockTestServerNow();
  await advanceMockBreak(sessionId, registrationId, { now });

  const [session] = await db
    .select()
    .from(mockTestSessions)
    .where(
      and(
        eq(mockTestSessions.id, sessionId),
        eq(mockTestSessions.registrationId, registrationId)
      )
    )
    .limit(1);

  if (!session) return null;
  if (session.status === "completed") {
    return {
      sessionId: session.id,
      registrationId: session.registrationId,
      status: "completed" as const,
      currentSectionOrder: session.currentSectionOrder,
      serverNow: now.toISOString(),
    };
  }

  if (session.currentBreakAfter && session.breakStartedAt && session.breakEndsAt) {
    const finishedSection = getMockSectionConfig(session.currentSectionOrder);
    const nextSection = getMockSectionConfig(session.currentSectionOrder + 1);
    if (!finishedSection || !nextSection) {
      throw new Error("Invalid mock break state.");
    }

    return {
      sessionId: session.id,
      registrationId: session.registrationId,
      status: session.currentBreakAfter === "math" ? ("break" as const) : ("transition" as const),
      currentSectionOrder: session.currentSectionOrder,
      break: {
        afterSectionKey: session.currentBreakAfter,
        afterSectionTitle: finishedSection.title,
        startedAt: session.breakStartedAt.toISOString(),
        endsAt: session.breakEndsAt.toISOString(),
        nextSection: {
          key: nextSection.key,
          title: nextSection.title,
          durationMinutes: nextSection.durationMinutes,
          questionCount: nextSection.questionCount,
          constellation: nextSection.constellation,
          color: nextSection.color,
        },
      },
      serverNow: now.toISOString(),
    };
  }

  const section = getMockSectionConfig(session.currentSectionOrder);
  if (!section) throw new Error("Invalid mock section state.");

  const [sectionRun] = await db
    .select()
    .from(mockTestSectionRuns)
    .where(
      and(
        eq(mockTestSectionRuns.sessionId, session.id),
        eq(mockTestSectionRuns.sectionOrder, session.currentSectionOrder)
      )
    )
    .limit(1);

  if (!sectionRun) throw new Error("Missing mock section run.");

  const rows = await db
    .select({
      questionId: questions.id,
      position: mockTestFormQuestions.position,
      topic: actTopics.name,
      difficulty: questions.difficulty,
      prompt: questions.prompt,
      choices: questions.choices,
      passage: questions.passage,
      questionSetId: questions.questionSetId,
      questionSetTitle: questionSets.title,
      questionSetContent: questionSets.content,
      selectedAnswer: mockTestAnswers.selectedAnswer,
      flagged: mockTestAnswers.flagged,
    })
    .from(mockTestFormQuestions)
    .innerJoin(questions, eq(mockTestFormQuestions.questionId, questions.id))
    .innerJoin(actTopics, eq(questions.topicId, actTopics.id))
    .leftJoin(questionSets, eq(questions.questionSetId, questionSets.id))
    .innerJoin(
      mockTestAnswers,
      and(
        eq(mockTestAnswers.sessionId, session.id),
        eq(mockTestAnswers.questionId, questions.id)
      )
    )
    .where(
      and(
        eq(mockTestFormQuestions.formId, session.formId),
        eq(mockTestFormQuestions.sectionKey, section.key)
      )
    )
    .orderBy(asc(mockTestFormQuestions.position));

  return {
    sessionId: session.id,
    registrationId: session.registrationId,
    status: "in_progress" as const,
    currentSectionOrder: session.currentSectionOrder,
    section: {
      key: section.key,
      title: section.title,
      durationMinutes: section.durationMinutes,
      questionCount: section.questionCount,
      sectionRunId: sectionRun.id,
      startedAt: sectionRun.startedAt?.toISOString() ?? null,
      deadlineAt: sectionRun.deadlineAt?.toISOString() ?? null,
      questions: rows.map((row) => ({
        id: row.questionId,
        position: row.position,
        topic: row.topic,
        difficulty: row.difficulty,
        question_text: row.prompt,
        choices: row.choices,
        passage: row.passage ?? row.questionSetContent ?? null,
        questionSetId: row.questionSetId,
        questionSetTitle: row.questionSetTitle,
        selectedAnswer: row.selectedAnswer,
        flagged: row.flagged,
      })),
    },
    serverNow: now.toISOString(),
  };
}
