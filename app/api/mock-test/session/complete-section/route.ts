import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  mockRegistrations,
  mockTestOpsEvents,
  mockTestSectionRuns,
  mockTestSessions,
} from "@/db/schema";
import { getDb } from "@/lib/db";
import { getMockTestUser } from "@/lib/mockTest/auth";
import { getMockTestServerNow } from "@/lib/mockTest/devClock";
import { captureAcedError } from "@/lib/monitoring";
import {
  canBypassMockEventWindow,
  getMockBreakDurationSeconds,
  getMockSectionConfig,
  getMockTransitionDurationSeconds,
  getPaidMockRegistration,
  loadMockSessionPayload,
} from "@/lib/mockTest/runner";

const schema = z.object({
  sessionId: z.string().uuid(),
  outboxEmpty: z.boolean().optional().default(false),
});

function getDevSeconds(request: Request, key: "devBreakSeconds" | "devTransitionSeconds") {
  const raw = new URL(request.url).searchParams.get(key);
  if (!raw) return { value: null as number | null, forbidden: false };
  if (!canBypassMockEventWindow()) {
    return { value: null as number | null, forbidden: true };
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return { value: null as number | null, forbidden: false };
  }
  return { value: Math.floor(parsed), forbidden: false };
}

export async function POST(request: Request) {
  const devBreak = getDevSeconds(request, "devBreakSeconds");
  const devTransition = getDevSeconds(request, "devTransitionSeconds");
  if (devBreak.forbidden || devTransition.forbidden) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid section completion request." }, { status: 400 });
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

  const now = getMockTestServerNow();

  let result;
  try {
    result = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from mock_test_sessions where id = ${parsed.data.sessionId} for update`);

    const [session] = await tx
      .select({
        id: mockTestSessions.id,
        status: mockTestSessions.status,
        currentSectionOrder: mockTestSessions.currentSectionOrder,
        currentBreakAfter: mockTestSessions.currentBreakAfter,
      })
      .from(mockTestSessions)
      .where(
        and(
          eq(mockTestSessions.id, parsed.data.sessionId),
          eq(mockTestSessions.registrationId, registration.id)
        )
      )
      .limit(1);

    if (!session) return { error: "Mock session not found.", status: 404 as const };
    if (session.status === "completed") {
      return { completed: true as const, sessionId: session.id };
    }
    if (session.currentBreakAfter) {
      return { completed: false as const, sessionId: session.id };
    }

    const [currentRun] = await tx
      .select({ id: mockTestSectionRuns.id, completedAt: mockTestSectionRuns.completedAt })
      .from(mockTestSectionRuns)
      .where(
        and(
          eq(mockTestSectionRuns.sessionId, session.id),
          eq(mockTestSectionRuns.sectionOrder, session.currentSectionOrder)
        )
      )
      .limit(1);

    if (!currentRun) return { error: "Current section run is missing.", status: 500 as const };

    if (!currentRun.completedAt) {
      await tx
        .update(mockTestSectionRuns)
        .set({
          completedAt: now,
          outboxClearedAt: parsed.data.outboxEmpty ? now : null,
          updatedAt: now,
        })
        .where(eq(mockTestSectionRuns.id, currentRun.id));
    }

    const currentSection = getMockSectionConfig(session.currentSectionOrder);
    if (!currentSection) {
      return { error: "Current section configuration is invalid.", status: 500 as const };
    }

    const nextSection = getMockSectionConfig(session.currentSectionOrder + 1);
    if (!nextSection) {
      await tx
        .update(mockTestSessions)
        .set({
          status: "completed",
          currentBreakAfter: null,
          breakStartedAt: null,
          breakEndsAt: null,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(mockTestSessions.id, session.id));

      await tx
        .update(mockRegistrations)
        .set({ finishedAt: now, updatedAt: now })
        .where(eq(mockRegistrations.id, registration.id));

      return { completed: true as const, sessionId: session.id };
    }

    const pauseSeconds =
      currentSection.key === "math"
        ? getMockBreakDurationSeconds(currentSection.key, devBreak.value)
        : getMockTransitionDurationSeconds(currentSection.key, devTransition.value);

    if (!pauseSeconds) {
      return { error: "Pause configuration is invalid.", status: 500 as const };
    }

    const pauseEndsAt = new Date(now.getTime() + pauseSeconds * 1000);

    await tx
      .update(mockTestSessions)
      .set({
        currentBreakAfter: currentSection.key as "english" | "math" | "reading",
        breakStartedAt: now,
        breakEndsAt: pauseEndsAt,
        updatedAt: now,
      })
      .where(eq(mockTestSessions.id, session.id));

    if (currentSection.key === "math") {
      await tx.insert(mockTestOpsEvents).values({
        mockTestId: registration.mockTestId,
        registrationId: registration.id,
        sessionId: session.id,
        sectionKey: "math",
        kind: "break_started",
        details: {
          startedAt: now.toISOString(),
          scheduledEndsAt: pauseEndsAt.toISOString(),
        },
        createdAt: now,
      });
    }

    return { completed: false as const, sessionId: session.id };
  });

  } catch (error) {
    captureAcedError(error, "mock-section-submit", user.id);
    throw error;
  }

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const payload = await loadMockSessionPayload(result.sessionId, registration.id);
  return NextResponse.json({ session: payload });
}
