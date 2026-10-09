import { NextResponse } from "next/server";
import { getMockTestServerNow } from "@/lib/mockTest/devClock";
import { isAuthorizedMockReleaseCron } from "@/lib/mockTest/cron-auth";
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

  try {
    const result = await releaseMockTest({
      connectionString: process.env.DATABASE_URL,
      slug: NEXT_MOCK.mockTestSlug,
      now: getMockTestServerNow(),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[mock-test release cron] release attempt failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Mock-test release failed. The next scheduled run will retry." },
      { status: 500 }
    );
  }
}
