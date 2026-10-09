import { NextResponse } from "next/server";
import { getMockTestServerNow } from "@/lib/mockTest/devClock";
import { releaseMockTest } from "@/lib/mockTest/release";
import { NEXT_MOCK } from "@/lib/mockTests";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    const secret = process.env.CRON_SECRET;
    const authorization = request.headers.get("authorization");
    if (!secret || authorization !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 503 });
  }

  const result = await releaseMockTest({
    connectionString: process.env.DATABASE_URL,
    slug: NEXT_MOCK.mockTestSlug,
    now: getMockTestServerNow(),
  });

  return NextResponse.json(result);
}
