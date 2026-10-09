import { NextResponse } from "next/server";
import { getMockTestUser } from "@/lib/mockTest/auth";
import { getMockTestServerNow } from "@/lib/mockTest/devClock";
import { getPaidMockRegistration } from "@/lib/mockTest/runner";

export async function GET() {
  const user = await getMockTestUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const registration = await getPaidMockRegistration(user.id);
  if (!registration) {
    return NextResponse.json({ error: "Paid registration required." }, { status: 403 });
  }

  return NextResponse.json({ serverNow: getMockTestServerNow().toISOString() });
}
