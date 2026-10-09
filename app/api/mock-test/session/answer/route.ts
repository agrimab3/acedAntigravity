import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  mockTestAnswers,
  mockTestOpsEvents,
  mockTestSectionRuns,
  mockTestSessions,
} from "@/db/schema";
import { getDb } from "@/lib/db";
import { getMockTestUser } from "@/lib/mockTest/auth";
import { getMockTestServerNow } from "@/lib/mockTest/devClock";
import { getPaidMockRegistration } from "@/lib/mockTest/runner";
import { classifyMockAnswerSync } from "@/lib/mockTest/offlineSync";
import { captureAcedError } from "@/lib/monitoring";

const answerSchema = z.object({
  questionId: z.string().uuid(),
  selectedAnswer: z.enum(["A", "B", "C", "D"]).nullable(),
  flagged: z.boolean(),
  clientSequence: z.number().int().nonnegative(),
  pickedAtServer: z.string().datetime(),
});

const schema = z.object({
  sessionId: z.string().uuid(),
  answers: z.array(answerSchema).max(250),
  outboxEmptySectionRunId: z.string().uuid().nullable().optional(),
});

type Resolution = {
  questionId: string;
  clientSequence: number;
  sectionKey?: string;
  syncedLate?: boolean;
  reason?: string;
};

export async function PATCH(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid answer sync request." }, { status: 400 });
  }

  const user = await getMockTestUser();
  const db = getDb();
  if (!user || !db) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const registration = await getPaidMockRegistration(user.id);
  if (!registration) {
    return NextResponse.json({ error: "Paid registration required." }, { status: 403 });
  }

  const receivedAt = getMockTestServerNow();
  const accepted: Resolution[] = [];
  const rejected: Resolution[] = [];

  try {
    await db.transaction(async (tx) => {
    const [session] = await tx
      .select({ id: mockTestSessions.id })
      .from(mockTestSessions)
      .where(
        and(
          eq(mockTestSessions.id, parsed.data.sessionId),
          eq(mockTestSessions.registrationId, registration.id)
        )
      )
      .limit(1);

    if (!session) throw new Error("Mock session not found.");

    const ordered = [...parsed.data.answers].sort(
      (a, b) => a.clientSequence - b.clientSequence
    );

    for (const incoming of ordered) {
      await tx.execute(
        sql`select id from mock_test_answers where session_id = ${session.id} and question_id = ${incoming.questionId} for update`
      );

      const [row] = await tx
        .select({
          id: mockTestAnswers.id,
          clientSequence: mockTestAnswers.clientSequence,
          sectionRunId: mockTestAnswers.sectionRunId,
          sectionKey: mockTestSectionRuns.sectionKey,
          startedAt: mockTestSectionRuns.startedAt,
          deadlineAt: mockTestSectionRuns.deadlineAt,
        })
        .from(mockTestAnswers)
        .innerJoin(
          mockTestSectionRuns,
          eq(mockTestAnswers.sectionRunId, mockTestSectionRuns.id)
        )
        .where(
          and(
            eq(mockTestAnswers.sessionId, session.id),
            eq(mockTestAnswers.questionId, incoming.questionId)
          )
        )
        .limit(1);

      if (!row) {
        rejected.push({
          questionId: incoming.questionId,
          clientSequence: incoming.clientSequence,
          reason: "question_not_in_session",
        });
        continue;
      }

      if (!row.startedAt || !row.deadlineAt) {
        rejected.push({
          questionId: incoming.questionId,
          clientSequence: incoming.clientSequence,
          sectionKey: row.sectionKey,
          reason: "section_not_started",
        });
        continue;
      }

      if (incoming.clientSequence <= row.clientSequence) {
        accepted.push({
          questionId: incoming.questionId,
          clientSequence: incoming.clientSequence,
          sectionKey: row.sectionKey,
          syncedLate: false,
        });
        continue;
      }

      const pickedAt = new Date(incoming.pickedAtServer);
      const decision = classifyMockAnswerSync(
        receivedAt,
        pickedAt,
        row.deadlineAt
      );

      if (!decision.accepted) {
        rejected.push({
          questionId: incoming.questionId,
          clientSequence: incoming.clientSequence,
          sectionKey: row.sectionKey,
          reason: decision.reason,
        });
        await tx.insert(mockTestOpsEvents).values({
          mockTestId: registration.mockTestId,
          registrationId: registration.id,
          sessionId: session.id,
          sectionKey: row.sectionKey,
          kind: "answer_sync_rejected",
          details: {
            reason: decision.reason,
            pickedAtServer: pickedAt.toISOString(),
            receivedAt: receivedAt.toISOString(),
          },
          createdAt: receivedAt,
        });
        continue;
      }

      await tx
        .update(mockTestAnswers)
        .set({
          selectedAnswer: incoming.selectedAnswer,
          flagged: incoming.flagged,
          answeredAt: pickedAt,
          pickedAtServer: pickedAt,
          clientSequence: incoming.clientSequence,
          syncedLate: decision.syncedLate,
          updatedAt: receivedAt,
        })
        .where(eq(mockTestAnswers.id, row.id));

      accepted.push({
        questionId: incoming.questionId,
        clientSequence: incoming.clientSequence,
        sectionKey: row.sectionKey,
        syncedLate: decision.syncedLate,
      });
    }

    if (parsed.data.outboxEmptySectionRunId) {
      const [run] = await tx
        .select({
          id: mockTestSectionRuns.id,
          deadlineAt: mockTestSectionRuns.deadlineAt,
          completedAt: mockTestSectionRuns.completedAt,
        })
        .from(mockTestSectionRuns)
        .where(
          and(
            eq(mockTestSectionRuns.id, parsed.data.outboxEmptySectionRunId),
            eq(mockTestSectionRuns.sessionId, session.id)
          )
        )
        .limit(1);

      if (
        run &&
        run.deadlineAt &&
        (run.completedAt || receivedAt.getTime() >= run.deadlineAt.getTime())
      ) {
        await tx
          .update(mockTestSectionRuns)
          .set({ outboxClearedAt: receivedAt, updatedAt: receivedAt })
          .where(eq(mockTestSectionRuns.id, run.id));
      }
    }
  });

  } catch (error) {
    captureAcedError(error, "mock-answer-save", user.id);
    throw error;
  }

  return NextResponse.json({
    accepted,
    rejected,
    serverNow: receivedAt.toISOString(),
  });
}
