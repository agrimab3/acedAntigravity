import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildPracticeTestPayload, getPracticeTestMode } from "@/lib/practice-test-engine";

const searchSchema = z.object({
  mode: z.string().trim().min(1),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = searchSchema.safeParse({
    mode: url.searchParams.get("mode"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid practice test mode." }, { status: 400 });
  }

  const mode = getPracticeTestMode(parsed.data.mode);

  if (!mode) {
    return NextResponse.json({ error: "Unsupported practice test mode." }, { status: 400 });
  }

  const session = await getAuthSession();
  const userId = session?.user?.id ?? null;
  const db = getDb();

  const payload = await buildPracticeTestPayload({
    db,
    userId,
    mode,
  });

  return NextResponse.json({
    mode: mode.key,
    title: mode.title,
    format: mode.format,
    scienceOptional: mode.scienceOptional,
    usesMockFill: payload.usesMockFill,
    sections: payload.sections,
  });
}
