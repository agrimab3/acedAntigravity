import crypto from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  adminAuditLog,
  mockRegistrations,
  mockTestOpsEvents,
  mockTestSectionRuns,
  mockTestSessions,
  mockTestTopicResults,
  mockTests,
  mockWaitlist,
  users,
} from "@/db/schema";
import { getDb } from "@/lib/db";
import {
  mockTestAdminNotFoundResponse,
  requireMockTestAdminApi,
} from "@/lib/admin/mockTestAdmin";
import { releaseMockTest } from "@/lib/mockTest/release";
import { getMockTestServerNow } from "@/lib/mockTest/devClock";
import { MOCK_TEST_SEAT_CAP } from "@/lib/mockTest/seat-policy";
import { WAITLIST_INVITE_MS } from "@/lib/mockTest/waitlist-policy";
import {
  processMockEmailOutbox,
  queueWaitlistInviteEmail,
  reconcileMockTestEmailOutbox,
} from "@/lib/mockTest/email-outbox";

const reason = z.string().trim().min(3).max(500);
const slug = z.string().min(1).max(100);

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set_seat_limit"),
    slug,
    reason,
    seatLimit: z.number().int().min(1).max(100000),
  }),
  z.object({
    action: z.literal("set_signups_paused"),
    slug,
    reason,
    paused: z.boolean(),
  }),
  z.object({
    action: z.literal("invite_waitlist"),
    slug,
    reason,
    count: z.number().int().min(1).max(200),
  }),
  z.object({
    action: z.literal("add_time"),
    slug,
    reason,
    registrationId: z.string().uuid(),
    minutes: z.number().int().min(1).max(15),
    confirmText: z.string(),
  }),
  z.object({
    action: z.literal("reopen_start"),
    slug,
    reason,
    registrationId: z.string().uuid(),
    until: z.string().datetime(),
    confirmText: z.string(),
  }),
  z.object({
    action: z.literal("reset_attempt"),
    slug,
    reason,
    registrationId: z.string().uuid(),
    confirmText: z.string(),
  }),
  z.object({
    action: z.literal("run_release"),
    slug,
    reason,
  }),
]);

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function auditActionName(input: z.infer<typeof actionSchema>) {
  if (input.action === "set_signups_paused") {
    return input.paused ? "pause_signups" : "resume_signups";
  }
  return input.action;
}

export async function POST(request: Request) {
  const admin = await requireMockTestAdminApi();
  if (!admin?.user?.email) return mockTestAdminNotFoundResponse();

  const parsed = actionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid admin action." }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 500 });
  }

  const input = parsed.data;
  const adminEmail = normalizeEmail(admin.user.email);
  const now = getMockTestServerNow();

  if (input.action === "run_release") {
    const [test] = await db
      .select({
        id: mockTests.id,
        resultsReleaseAt: mockTests.resultsReleaseAt,
        status: mockTests.status,
      })
      .from(mockTests)
      .where(eq(mockTests.slug, input.slug))
      .limit(1);

    if (!test) return NextResponse.json({ error: "Mock test not found." }, { status: 404 });
    if (now.getTime() < test.resultsReleaseAt.getTime()) {
      await db.insert(adminAuditLog).values({
        adminEmail,
        action: "run_release",
        target: test.id,
        details: {
          before: { status: test.status },
          after: null,
          status: "failed",
          error: "Release time has not arrived yet.",
        },
        reason: input.reason,
        createdAt: now,
      });
      return NextResponse.json({ error: "Release time has not arrived yet." }, { status: 409 });
    }

    const before = { status: test.status };
    const [audit] = await db
      .insert(adminAuditLog)
      .values({
        adminEmail,
        action: "run_release",
        target: test.id,
        details: { before, after: null, status: "started" },
        reason: input.reason,
        createdAt: now,
      })
      .returning({ id: adminAuditLog.id });

    try {
      const result = await releaseMockTest({
        connectionString: process.env.DATABASE_URL!,
        slug: input.slug,
        now,
        includeDev: process.env.NODE_ENV !== "production",
      });
      const [afterTest] = await db
        .select({ status: mockTests.status, releasedAt: mockTests.releasedAt })
        .from(mockTests)
        .where(eq(mockTests.id, test.id))
        .limit(1);

      await db
        .update(adminAuditLog)
        .set({
          details: {
            before,
            after: afterTest ?? null,
            result,
            status: "success",
          },
        })
        .where(eq(adminAuditLog.id, audit.id));

      try {
        await reconcileMockTestEmailOutbox(input.slug);
        await processMockEmailOutbox(now);
      } catch (emailError) {
        console.error("[mock-test email] manual release email pass failed; cron will retry", {
          error: emailError instanceof Error ? emailError.message : String(emailError),
        });
      }

      return NextResponse.json({ ok: true, result });
    } catch (error) {
      await db
        .update(adminAuditLog)
        .set({
          details: {
            before,
            after: null,
            status: "failed",
            error: error instanceof Error ? error.message : "Release failed.",
          },
        })
        .where(eq(adminAuditLog.id, audit.id));
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Release failed." },
        { status: 500 }
      );
    }
  }

  try {
    const result = await db.transaction(async (tx) => {
    const [test] = await tx
      .select({
        id: mockTests.id,
        seatLimit: mockTests.seatLimit,
        signupsPaused: mockTests.signupsPaused,
        status: mockTests.status,
      })
      .from(mockTests)
      .where(eq(mockTests.slug, input.slug))
      .limit(1);

    if (!test) throw new Error("Mock test not found.");

    if (input.action === "set_seat_limit") {
      if (input.seatLimit !== MOCK_TEST_SEAT_CAP) {
        throw new Error(`The mock-test seat cap is fixed at ${MOCK_TEST_SEAT_CAP}.`);
      }
      const paidResult = await tx.execute(sql`
        select count(*)::int as paid
        from mock_registrations
        where mock_test_id=${test.id} and paid_at is not null
      `);
      const paid = Number((paidResult.rows[0] as { paid?: unknown })?.paid ?? 0);
      if (input.seatLimit < paid) {
        throw new Error("Seat limit cannot be lower than the current paid count.");
      }

      await tx
        .update(mockTests)
        .set({ seatLimit: input.seatLimit })
        .where(eq(mockTests.id, test.id));

      await tx.insert(adminAuditLog).values({
        adminEmail,
        action: "set_seat_limit",
        target: test.id,
        details: {
          before: { seatLimit: test.seatLimit },
          after: { seatLimit: input.seatLimit },
          paidCount: paid,
        },
        reason: input.reason,
        createdAt: now,
      });

      return { seatLimit: input.seatLimit };
    }

    if (input.action === "set_signups_paused") {
      await tx
        .update(mockTests)
        .set({ signupsPaused: input.paused })
        .where(eq(mockTests.id, test.id));

      await tx.insert(adminAuditLog).values({
        adminEmail,
        action: input.paused ? "pause_signups" : "resume_signups",
        target: test.id,
        details: {
          before: { signupsPaused: test.signupsPaused },
          after: { signupsPaused: input.paused },
        },
        reason: input.reason,
        createdAt: now,
      });

      return { signupsPaused: input.paused };
    }

    if (input.action === "invite_waitlist") {
      await tx.execute(sql`select id from mock_tests where id=${test.id} for update`);
      const inviteCutoff = new Date(now.getTime() - WAITLIST_INVITE_MS);
      const occupiedResult = await tx.execute(sql`
        select
          (
            select count(*)::int
            from mock_registrations
            where mock_test_id=${test.id}
              and (paid_at is not null or (hold_expires_at is not null and hold_expires_at > ${now}))
          ) + (
            select count(*)::int
            from mock_waitlist
            where mock_test_id=${test.id}
              and invited_at is not null
              and invite_used_at is null
              and invited_at > ${inviteCutoff}
          ) as occupied
      `);
      const occupied = Number((occupiedResult.rows[0] as { occupied?: unknown })?.occupied ?? 0);
      const available = Math.max(0, MOCK_TEST_SEAT_CAP - occupied);
      const inviteCount = Math.min(input.count, available);

      const rows = inviteCount > 0
        ? await tx.execute(sql`
            select id, email
            from mock_waitlist
            where mock_test_id=${test.id}
              and invited_at is null
              and invite_used_at is null
            order by created_at asc, id asc
            limit ${inviteCount}
            for update skip locked
          `)
        : { rows: [] as unknown[] };

      const invitations: Array<{ waitlistId: string; email: string; link: string; token: string; invitedAt: Date }> = [];
      for (const raw of rows.rows as Array<{ id: string; email: string }>) {
        const token = crypto.randomBytes(24).toString("hex");
        await tx
          .update(mockWaitlist)
          .set({ invitedAt: now, inviteToken: token })
          .where(eq(mockWaitlist.id, raw.id));
        invitations.push({
          waitlistId: raw.id,
          email: raw.email,
          link: "/mock-test/signup?invite=" + token,
          token,
          invitedAt: now,
        });
      }

      await tx.insert(adminAuditLog).values({
        adminEmail,
        action: "invite_waitlist",
        target: test.id,
        details: {
          before: { seatLimit: MOCK_TEST_SEAT_CAP, occupied },
          after: { seatLimit: MOCK_TEST_SEAT_CAP, invitedCount: invitations.length },
          requestedCount: input.count,
          invitedEmails: invitations.map((item) => item.email),
        },
        reason: input.reason,
        createdAt: now,
      });

      return { invitations, seatLimit: MOCK_TEST_SEAT_CAP };
    }

    const registrationId = input.registrationId;
    const [student] = await tx
      .select({
        id: mockRegistrations.id,
        email: users.email,
        paidAt: mockRegistrations.paidAt,
        startedAt: mockRegistrations.startedAt,
        finishedAt: mockRegistrations.finishedAt,
        startOverrideUntil: mockRegistrations.startOverrideUntil,
      })
      .from(mockRegistrations)
      .innerJoin(users, eq(mockRegistrations.userId, users.id))
      .where(
        and(
          eq(mockRegistrations.id, registrationId),
          eq(mockRegistrations.mockTestId, test.id)
        )
      )
      .limit(1);

    if (!student) throw new Error("Student registration not found.");
    if (normalizeEmail(input.confirmText) !== normalizeEmail(student.email)) {
      throw new Error("Typed confirmation does not match the student's email.");
    }

    if (input.action === "add_time") {
      const [session] = await tx
        .select({
          id: mockTestSessions.id,
          status: mockTestSessions.status,
          currentSectionOrder: mockTestSessions.currentSectionOrder,
          currentBreakAfter: mockTestSessions.currentBreakAfter,
        })
        .from(mockTestSessions)
        .where(eq(mockTestSessions.registrationId, registrationId))
        .limit(1);

      if (!session || session.status !== "in_progress" || session.currentBreakAfter) {
        throw new Error("Student is not currently in an active section.");
      }

      const [run] = await tx
        .select({
          id: mockTestSectionRuns.id,
          sectionKey: mockTestSectionRuns.sectionKey,
          deadlineAt: mockTestSectionRuns.deadlineAt,
          completedAt: mockTestSectionRuns.completedAt,
        })
        .from(mockTestSectionRuns)
        .where(
          and(
            eq(mockTestSectionRuns.sessionId, session.id),
            eq(mockTestSectionRuns.sectionOrder, session.currentSectionOrder)
          )
        )
        .limit(1);

      if (!run?.deadlineAt || run.completedAt) {
        throw new Error("Current section cannot receive extra time.");
      }

      const nextDeadline = new Date(run.deadlineAt.getTime() + input.minutes * 60_000);
      await tx
        .update(mockTestSectionRuns)
        .set({ deadlineAt: nextDeadline, updatedAt: now })
        .where(eq(mockTestSectionRuns.id, run.id));

      await tx.insert(mockTestOpsEvents).values({
        mockTestId: test.id,
        registrationId,
        sessionId: session.id,
        sectionKey: run.sectionKey,
        kind: "admin_time_added",
        details: {
          minutes: input.minutes,
          beforeDeadline: run.deadlineAt.toISOString(),
          afterDeadline: nextDeadline.toISOString(),
          reason: input.reason,
        },
        createdAt: now,
      });

      await tx.insert(adminAuditLog).values({
        adminEmail,
        action: "add_time",
        target: registrationId,
        details: {
          before: { deadlineAt: run.deadlineAt.toISOString() },
          after: { deadlineAt: nextDeadline.toISOString() },
          sectionKey: run.sectionKey,
          minutes: input.minutes,
        },
        reason: input.reason,
        createdAt: now,
      });

      return { deadlineAt: nextDeadline.toISOString(), minutes: input.minutes };
    }

    if (input.action === "reopen_start") {
      if (!student.paidAt) throw new Error("Student has not paid.");
      if (student.startedAt) throw new Error("Student has already started.");

      const [existingSession] = await tx
        .select({ id: mockTestSessions.id })
        .from(mockTestSessions)
        .where(eq(mockTestSessions.registrationId, registrationId))
        .limit(1);
      if (existingSession) throw new Error("Student already has a test session.");

      const until = new Date(input.until);
      if (until.getTime() <= now.getTime()) throw new Error("Override end time must be in the future.");

      await tx
        .update(mockRegistrations)
        .set({ startOverrideUntil: until, updatedAt: now })
        .where(eq(mockRegistrations.id, registrationId));

      await tx.insert(adminAuditLog).values({
        adminEmail,
        action: "reopen_start",
        target: registrationId,
        details: {
          before: { startOverrideUntil: student.startOverrideUntil?.toISOString() ?? null },
          after: { startOverrideUntil: until.toISOString() },
        },
        reason: input.reason,
        createdAt: now,
      });

      return { startOverrideUntil: until.toISOString() };
    }

    if (input.action === "reset_attempt") {
      if (test.status === "released") throw new Error("Cannot reset after results are released.");
      if (student.finishedAt) throw new Error("Cannot reset a finished attempt.");

      const [session] = await tx
        .select({ id: mockTestSessions.id })
        .from(mockTestSessions)
        .where(eq(mockTestSessions.registrationId, registrationId))
        .limit(1);

      if (session) {
        await tx.delete(mockTestSessions).where(eq(mockTestSessions.id, session.id));
      }
      await tx
        .delete(mockTestTopicResults)
        .where(eq(mockTestTopicResults.registrationId, registrationId));
      await tx
        .delete(mockTestOpsEvents)
        .where(
          and(
            eq(mockTestOpsEvents.registrationId, registrationId),
            inArray(mockTestOpsEvents.kind, [
              "answer_sync_rejected",
              "break_started",
              "break_ended",
              "admin_time_added",
            ])
          )
        );

      await tx
        .update(mockRegistrations)
        .set({
          startedAt: null,
          finishedAt: null,
          startOverrideUntil: null,
          englishScore: null,
          mathScore: null,
          readingScore: null,
          scienceScore: null,
          composite: null,
          percentile: null,
          updatedAt: now,
        })
        .where(eq(mockRegistrations.id, registrationId));

      await tx.insert(adminAuditLog).values({
        adminEmail,
        action: "reset_attempt",
        target: registrationId,
        details: {
          before: {
            sessionId: session?.id ?? null,
            startedAt: student.startedAt?.toISOString() ?? null,
            finishedAt: null,
          },
          after: { sessionId: null, startedAt: null, finishedAt: null },
        },
        reason: input.reason,
        createdAt: now,
      });

      return { reset: true };
    }

    throw new Error("Unsupported admin action.");
  });

    if (input.action === "invite_waitlist") {
      const invitations =
        (result as {
          invitations?: Array<{
            waitlistId: string;
            invitedAt: Date;
            token: string;
          }>;
        }).invitations ?? [];
      for (const invitation of invitations) {
        try {
          await queueWaitlistInviteEmail({
            waitlistId: invitation.waitlistId,
            invitedAt: invitation.invitedAt,
            token: invitation.token,
          });
        } catch (error) {
          console.error("[mock-test email] failed to queue admin waitlist invite", {
            waitlistId: invitation.waitlistId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin action failed.";
    const [failedTest] = await db
      .select({ id: mockTests.id })
      .from(mockTests)
      .where(eq(mockTests.slug, input.slug))
      .limit(1);

    if (failedTest) {
      const target =
        "registrationId" in input ? input.registrationId : failedTest.id;
      await db.insert(adminAuditLog).values({
        adminEmail,
        action: auditActionName(input),
        target,
        details: {
          before: null,
          after: null,
          status: "failed",
          error: message,
        },
        reason: input.reason,
        createdAt: now,
      });
    }

    return NextResponse.json({ error: message }, { status: 409 });
  }
}
