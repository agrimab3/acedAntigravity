import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  mockRegistrations,
  mockTestAnswers,
  mockTestFormQuestions,
  mockTestSectionRuns,
  mockTestSessions,
} from "@/db/schema";
import { getDb } from "@/lib/db";
import { getMockTestUser } from "@/lib/mockTest/auth";
import {
  getLockedMockForm,
  getMockSectionConfig,
  getMockSectionTimeLimitSeconds,
  getMockStartWindowState,
  getPaidMockRegistration,
  loadMockSessionPayload,
} from "@/lib/mockTest/runner";

export async function GET() {
  const user = await getMockTestUser();
  const db = getDb();
  if (!user || !db) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const registration = await getPaidMockRegistration(user.id);
  if (!registration) {
    return NextResponse.json({ error: "Paid mock-test registration required." }, { status: 403 });
  }

  const [session] = await db
    .select({ id: mockTestSessions.id })
    .from(mockTestSessions)
    .where(eq(mockTestSessions.registrationId, registration.id))
    .limit(1);

  if (!session) {
    return NextResponse.json({
      session: null,
      startWindow: getMockStartWindowState(
        registration.timeZone,
        new Date(),
        registration.startOverrideUntil
      ),
    });
  }

  const payload = await loadMockSessionPayload(session.id, registration.id);
  return NextResponse.json({ session: payload });
}

export async function POST() {
  const user = await getMockTestUser();
  const db = getDb();
  if (!user || !db) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const registration = await getPaidMockRegistration(user.id);
  if (!registration) {
    return NextResponse.json({ error: "Paid mock-test registration required." }, { status: 403 });
  }

  const [existing] = await db
    .select({ id: mockTestSessions.id })
    .from(mockTestSessions)
    .where(eq(mockTestSessions.registrationId, registration.id))
    .limit(1);

  if (existing) {
    const payload = await loadMockSessionPayload(existing.id, registration.id);
    return NextResponse.json({ session: payload, resumed: true });
  }

  const startWindow = getMockStartWindowState(
    registration.timeZone,
    new Date(),
    registration.startOverrideUntil
  );
  if (!startWindow.allowed) {
    return NextResponse.json(
      { error: "The mock test is not currently available to start.", reason: startWindow.reason },
      { status: 409 }
    );
  }

  const form = await getLockedMockForm(registration.mockTestId);
  if (!form) {
    return NextResponse.json(
      { error: "The official mock-test form is not locked yet." },
      { status: 409 }
    );
  }

  const now = new Date();
  const firstSection = getMockSectionConfig(0);
  if (!firstSection) {
    return NextResponse.json({ error: "Mock-test section configuration is invalid." }, { status: 500 });
  }

  const sessionId = await db.transaction(async (tx) => {
    const [session] = await tx
      .insert(mockTestSessions)
      .values({
        registrationId: registration.id,
        formId: form.id,
        status: "in_progress",
        currentSectionOrder: 0,
        startedAt: now,
        updatedAt: now,
      })
      .returning({ id: mockTestSessions.id });

    const sectionRuns = [];
    for (let order = 0; order < 4; order += 1) {
      const config = getMockSectionConfig(order);
      if (!config) throw new Error("Missing section configuration.");
      const isFirst = order === 0;
      const timeLimitSeconds = getMockSectionTimeLimitSeconds(order, form.version);
      if (!timeLimitSeconds) throw new Error("Missing section time limit.");
      const [run] = await tx
        .insert(mockTestSectionRuns)
        .values({
          sessionId: session.id,
          sectionKey: config.key,
          sectionOrder: order,
          timeLimitSeconds,
          startedAt: isFirst ? now : null,
          deadlineAt: isFirst ? new Date(now.getTime() + timeLimitSeconds * 1000) : null,
          updatedAt: now,
        })
        .returning({ id: mockTestSectionRuns.id, sectionKey: mockTestSectionRuns.sectionKey });
      sectionRuns.push(run);
    }

    const assignments = await tx
      .select({
        questionId: mockTestFormQuestions.questionId,
        sectionKey: mockTestFormQuestions.sectionKey,
        position: mockTestFormQuestions.position,
      })
      .from(mockTestFormQuestions)
      .where(eq(mockTestFormQuestions.formId, form.id));

    const runIdBySection = new Map(sectionRuns.map((run) => [run.sectionKey, run.id]));
    if (assignments.length !== 171) {
      throw new Error("Locked form does not contain 171 assignments.");
    }

    await tx.insert(mockTestAnswers).values(
      assignments.map((assignment) => ({
        sessionId: session.id,
        sectionRunId: runIdBySection.get(assignment.sectionKey)!,
        questionId: assignment.questionId,
        questionOrder: assignment.position,
        selectedAnswer: null,
        flagged: false,
        updatedAt: now,
      }))
    );

    await tx
      .update(mockRegistrations)
      .set({
        startedAt: registration.startedAt ?? now,
        startOverrideUntil: null,
        updatedAt: now,
      })
      .where(eq(mockRegistrations.id, registration.id));

    return session.id;
  });

  const payload = await loadMockSessionPayload(sessionId, registration.id);
  return NextResponse.json({ session: payload, resumed: false });
}
