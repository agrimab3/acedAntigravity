import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { mockTestForms, mockTests } from "@/db/schema";
import { getAdminSession } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { getMockFormAudit } from "@/lib/mockTest/formAudit";

const patchSchema = z.object({
  formId: z.string().uuid(),
  action: z.enum(["mark-review", "lock"]),
});

export async function GET(request: Request) {
  const session = await getAdminSession();
  const db = getDb();
  if (!session || !db) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const formId = url.searchParams.get("formId");

  if (formId) {
    const audit = await getMockFormAudit(formId);
    if (!audit) return NextResponse.json({ error: "Form not found." }, { status: 404 });
    return NextResponse.json({ audit });
  }

  const forms = await db
    .select({
      id: mockTestForms.id,
      version: mockTestForms.version,
      status: mockTestForms.status,
      reviewedAt: mockTestForms.reviewedAt,
      lockedAt: mockTestForms.lockedAt,
      createdAt: mockTestForms.createdAt,
      slug: mockTests.slug,
      testDate: mockTests.testDate,
    })
    .from(mockTestForms)
    .innerJoin(mockTests, eq(mockTestForms.mockTestId, mockTests.id))
    .orderBy(desc(mockTestForms.createdAt));

  return NextResponse.json({ forms });
}

export async function PATCH(request: Request) {
  const session = await getAdminSession();
  const db = getDb();
  if (!session?.user?.id || !db) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid form action." }, { status: 400 });
  }

  const audit = await getMockFormAudit(parsed.data.formId);
  if (!audit) {
    return NextResponse.json({ error: "Form not found." }, { status: 404 });
  }

  if (!audit.pass) {
    return NextResponse.json(
      {
        error: "Form audit failed. Resolve every failed check before changing review/lock status.",
        audit,
      },
      { status: 409 }
    );
  }

  if (parsed.data.action === "mark-review") {
    if (audit.form.status !== "draft") {
      return NextResponse.json({ error: "Only draft forms can move to review." }, { status: 409 });
    }

    const now = new Date();
    const [updated] = await db
      .update(mockTestForms)
      .set({ status: "review", reviewedAt: now, updatedAt: now })
      .where(eq(mockTestForms.id, parsed.data.formId))
      .returning();

    return NextResponse.json({ form: updated, audit: await getMockFormAudit(parsed.data.formId) });
  }

  if (audit.form.status !== "review") {
    return NextResponse.json({ error: "A form must be in review before it can be locked." }, { status: 409 });
  }

  const now = new Date();
  const locked = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from mock_test_forms where id = ${parsed.data.formId} for update`);

    const [current] = await tx
      .select({ status: mockTestForms.status })
      .from(mockTestForms)
      .where(eq(mockTestForms.id, parsed.data.formId))
      .limit(1);

    if (!current || current.status !== "review") {
      throw new Error("Form is no longer in review.");
    }

    const [updated] = await tx
      .update(mockTestForms)
      .set({
        status: "locked",
        lockedAt: now,
        lockedByUserId: session.user.id,
        updatedAt: now,
      })
      .where(eq(mockTestForms.id, parsed.data.formId))
      .returning();

    return updated;
  });

  return NextResponse.json({ form: locked, audit: await getMockFormAudit(parsed.data.formId) });
}
