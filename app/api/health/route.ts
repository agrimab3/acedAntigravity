import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "aced-web",
    timestamp: new Date().toISOString(),
  });
}
