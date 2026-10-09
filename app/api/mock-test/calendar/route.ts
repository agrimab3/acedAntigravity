import { NextResponse } from "next/server";
import { makeMockTestCalendarIcs } from "@/lib/mockTest/email-policy";
import { TIME_ZONES } from "@/lib/mockTests";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const timeZone = url.searchParams.get("timeZone") ?? "";
  if (!TIME_ZONES.some((zone) => zone.value === timeZone)) {
    return NextResponse.json({ error: "Invalid time zone." }, { status: 400 });
  }
  return new Response(makeMockTestCalendarIcs(timeZone), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="aced-mock-test-dec-5.ics"',
      "cache-control": "private, max-age=0, must-revalidate",
    },
  });
}
