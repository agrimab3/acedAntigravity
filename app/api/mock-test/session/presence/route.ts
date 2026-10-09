import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  mockTestClientPresence,
  mockTestSessions,
} from "@/db/schema";
import { getDb } from "@/lib/db";
import { getMockTestUser } from "@/lib/mockTest/auth";
import { getPaidMockRegistration } from "@/lib/mockTest/runner";
import { getMockTestServerNow } from "@/lib/mockTest/devClock";

const schema = z.object({
  sessionId: z.string().uuid(),
  clientId: z.string().min(8).max(120),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid presence request." }, { status: 400 });
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

  const [session] = await db
    .select({ id: mockTestSessions.id })
    .from(mockTestSessions)
    .where(
      and(
        eq(mockTestSessions.id, parsed.data.sessionId),
        eq(mockTestSessions.registrationId, registration.id)
      )
    )
    .limit(1);

  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const now = getMockTestServerNow();
  await db
    .insert(mockTestClientPresence)
    .values({
      registrationId: registration.id,
      sessionId: session.id,
      clientId: parsed.data.clientId,
      lastSeenAt: now,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [
        mockTestClientPresence.registrationId,
        mockTestClientPresence.clientId,
      ],
      set: {
        sessionId: session.id,
        lastSeenAt: now,
      },
    });

  return NextResponse.json({ ok: true, serverNow: now.toISOString() });
}
