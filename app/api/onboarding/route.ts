import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { users } from "@/db/schema";
import { getAuthSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  ACT_TEST_DATES_SOURCE_URL,
  isOnboardingComplete,
  isValidOnboardingGrade,
  isValidOnboardingTestDate,
  ONBOARDING_GRADE_OPTIONS,
  ONBOARDING_TEST_DATE_OPTIONS,
} from "@/lib/onboarding";

const onboardingPayloadSchema = z.object({
  preferredName: z
    .string()
    .trim()
    .min(1, "Tell us what to call you.")
    .max(40, "Keep your name under 40 characters."),
  gradeLevel: z.string(),
  actTestDate: z.string(),
  previousActScore: z.union([z.number().int().min(1).max(36), z.null()]),
  hasRecommendations: z.boolean(),
});

const walkthroughPayloadSchema = z.object({
  walkthroughCompleted: z.literal(true),
});

export async function GET() {
  const session = await getAuthSession();
  const db = getDb();

  if (!session?.user?.id || !session.user.email || !db) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const [user] = await db
    .select({
      email: users.email,
      googleName: users.name,
      preferredName: users.preferredName,
      gradeLevel: users.gradeLevel,
      actTestDate: users.actTestDate,
      previousActScore: users.previousActScore,
      hasRecommendations: users.hasRecommendations,
      onboardingCompletedAt: users.onboardingCompletedAt,
      walkthroughCompletedAt: users.walkthroughCompletedAt,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  return NextResponse.json({
    isComplete: isOnboardingComplete(user),
    profile: {
      ...user,
      onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? null,
      walkthroughCompletedAt: user.walkthroughCompletedAt?.toISOString() ?? null,
    },
    gradeOptions: ONBOARDING_GRADE_OPTIONS,
    testDateOptions: ONBOARDING_TEST_DATE_OPTIONS,
    actDatesSourceUrl: ACT_TEST_DATES_SOURCE_URL,
  });
}

export async function POST(request: Request) {
  const session = await getAuthSession();
  const db = getDb();

  if (!session?.user?.id || !db) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = onboardingPayloadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid onboarding payload." },
      { status: 400 }
    );
  }

  const payload = parsed.data;

  if (!isValidOnboardingGrade(payload.gradeLevel)) {
    return NextResponse.json({ error: "Pick your current grade." }, { status: 400 });
  }

  if (!isValidOnboardingTestDate(payload.actTestDate)) {
    return NextResponse.json({ error: "Pick an ACT date option." }, { status: 400 });
  }

  const now = new Date();

  await db
    .update(users)
    .set({
      preferredName: payload.preferredName,
      gradeLevel: payload.gradeLevel,
      actTestDate: payload.actTestDate,
      previousActScore: payload.previousActScore,
      hasRecommendations: payload.hasRecommendations,
      onboardingCompletedAt: now,
      updatedAt: now,
    })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const session = await getAuthSession();
  const db = getDb();

  if (!session?.user?.id || !db) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = walkthroughPayloadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid walkthrough payload." }, { status: 400 });
  }

  const now = new Date();

  await db
    .update(users)
    .set({
      walkthroughCompletedAt: now,
      updatedAt: now,
    })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ ok: true });
}
