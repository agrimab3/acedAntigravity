import { NextResponse } from "next/server";
import { z } from "zod";
import { getMockTestUser } from "@/lib/mockTest/auth";
import { getMockTestServerNow } from "@/lib/mockTest/devClock";
import {
  advanceMockBreak,
  canBypassMockEventWindow,
  getPaidMockRegistration,
  loadMockSessionPayload,
} from "@/lib/mockTest/runner";

const schema = z.object({
  sessionId: z.string().uuid(),
});

export async function POST(request: Request) {
  // DEV rehearsal convenience only. Real test-takers must take the full Math break.
  if (!canBypassMockEventWindow()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid start-next request." }, { status: 400 });
  }

  const user = await getMockTestUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const registration = await getPaidMockRegistration(user.id);
  if (!registration) {
    return NextResponse.json({ error: "Paid registration required." }, { status: 403 });
  }

  const before = await loadMockSessionPayload(parsed.data.sessionId, registration.id);
  if (!before) {
    return NextResponse.json({ error: "Mock session not found." }, { status: 404 });
  }
  if (before.status !== "break") {
    return NextResponse.json(
      { error: "The next section can only be started early during the Math break." },
      { status: 409 }
    );
  }

  await advanceMockBreak(parsed.data.sessionId, registration.id, {
    forceStart: true,
    now: getMockTestServerNow(),
  });

  const payload = await loadMockSessionPayload(parsed.data.sessionId, registration.id);
  if (!payload) {
    return NextResponse.json({ error: "Mock session not found." }, { status: 404 });
  }

  return NextResponse.json({ session: payload });
}
