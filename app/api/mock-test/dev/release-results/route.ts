import { NextResponse } from "next/server";
import { getMockTestUser } from "@/lib/mockTest/auth";
import { releaseMockTest } from "@/lib/mockTest/release";
import {
  canBypassMockEventWindow,
  getPaidMockRegistration,
} from "@/lib/mockTest/runner";
import { NEXT_MOCK } from "@/lib/mockTests";

export async function POST() {
  if (!canBypassMockEventWindow()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const user = await getMockTestUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const registration = await getPaidMockRegistration(user.id);
  if (!registration || !registration.finishedAt) {
    return NextResponse.json(
      { error: "Finish the DEV mock before releasing results." },
      { status: 409 }
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 503 });
  }

  const releaseAt = new Date(NEXT_MOCK.resultsReleaseUtc);
  const result = await releaseMockTest({
    connectionString: process.env.DATABASE_URL,
    slug: NEXT_MOCK.mockTestSlug,
    now: new Date(releaseAt.getTime() + 1000),
    includeDev: true,
  });

  return NextResponse.json(result);
}
