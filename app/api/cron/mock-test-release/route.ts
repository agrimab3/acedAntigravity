import { NextResponse } from "next/server";
import { getMockTestServerNow } from "@/lib/mockTest/devClock";
import { isAuthorizedMockReleaseCron } from "@/lib/mockTest/cron-auth";
import {
  processMockEmailOutbox,
  reconcileMockTestEmailOutbox,
} from "@/lib/mockTest/email-outbox";
import { releaseMockTest } from "@/lib/mockTest/release";
import { NEXT_MOCK } from "@/lib/mockTests";

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!isAuthorizedMockReleaseCron(process.env.CRON_SECRET, authorization)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 503 });
  }

  const now = getMockTestServerNow();
  let releaseResult: Awaited<ReturnType<typeof releaseMockTest>> | null = null;
  let releaseError: string | null = null;
  let emailResult: Awaited<ReturnType<typeof processMockEmailOutbox>> | null = null;
  let emailError: string | null = null;

  try {
    releaseResult = await releaseMockTest({
      connectionString: process.env.DATABASE_URL,
      slug: NEXT_MOCK.mockTestSlug,
      now,
    });
  } catch (error) {
    releaseError = error instanceof Error ? error.message : String(error);
    console.error("[mock-test release cron] release attempt failed", {
      error: releaseError,
    });
  }

  try {
    await reconcileMockTestEmailOutbox(NEXT_MOCK.mockTestSlug);
    emailResult = await processMockEmailOutbox(now);
  } catch (error) {
    emailError = error instanceof Error ? error.message : String(error);
    console.error("[mock-test email cron] email attempt failed", {
      error: emailError,
    });
  }

  if (releaseError || emailError) {
    return NextResponse.json(
      {
        error: "Mock-test cron had one or more failures. The next scheduled run will retry.",
        release: releaseResult,
        email: emailResult,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ release: releaseResult, email: emailResult });
}
