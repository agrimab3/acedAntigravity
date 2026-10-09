import "server-only";

import { asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { adminAuditLog, mockTests } from "@/db/schema";
import { getAuthSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getMockTestServerNow } from "@/lib/mockTest/devClock";

function adminEmailSet() {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isMockTestAdminEmail(email?: string | null) {
  if (!email) return false;
  return adminEmailSet().has(email.trim().toLowerCase());
}

export async function getMockTestAdminSession() {
  const session = await getAuthSession();
  return isMockTestAdminEmail(session?.user?.email) ? session : null;
}

export async function requireMockTestAdminPage() {
  const session = await getMockTestAdminSession();
  if (!session?.user?.email) notFound();
  return session;
}

export async function requireMockTestAdminApi() {
  return getMockTestAdminSession();
}

export function mockTestAdminNotFoundResponse() {
  return new Response("Not Found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function writeMockTestAdminAudit(input: {
  adminEmail: string;
  action: string;
  target: string;
  details: {
    before: unknown;
    after: unknown;
    [key: string]: unknown;
  };
  reason: string;
}) {
  const db = getDb();
  if (!db) throw new Error("Database unavailable.");

  const reason = input.reason.trim();
  if (!reason) throw new Error("Admin audit reason is required.");

  const [row] = await db
    .insert(adminAuditLog)
    .values({
      adminEmail: input.adminEmail.trim().toLowerCase(),
      action: input.action,
      target: input.target,
      details: input.details,
      reason,
    })
    .returning({ id: adminAuditLog.id });

  return row;
}

function pacificDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function getMockTestAdminPicker(selectedSlug?: string | null) {
  const db = getDb();
  if (!db) throw new Error("Database unavailable.");

  const tests = await db
    .select({
      id: mockTests.id,
      slug: mockTests.slug,
      testDate: mockTests.testDate,
      actDate: mockTests.actDate,
      status: mockTests.status,
      resultsReleaseAt: mockTests.resultsReleaseAt,
      seatLimit: mockTests.seatLimit,
    })
    .from(mockTests)
    .orderBy(asc(mockTests.testDate));

  if (tests.length === 0) return { tests, selected: null };

  const requested = selectedSlug
    ? tests.find((test) => test.slug === selectedSlug)
    : null;

  if (requested) return { tests, selected: requested };

  const today = pacificDateKey(getMockTestServerNow());
  const currentOrNext =
    tests.find((test) => test.testDate >= today && test.status !== "released") ??
    tests.find((test) => test.testDate >= today) ??
    tests.at(-1) ??
    null;

  return { tests, selected: currentOrNext };
}
