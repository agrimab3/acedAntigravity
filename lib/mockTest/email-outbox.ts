import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { Resend } from "resend";
import { mockEmailOutbox, mockWaitlist } from "@/db/schema";
import { getDb } from "@/lib/db";
import {
  getMockReminderAt,
  MOCK_EMAIL_FROM,
  MOCK_EMAIL_MAX_ATTEMPTS,
  MOCK_EMAIL_SUPPORT,
  resolveEmailDeliveryTarget,
} from "@/lib/mockTest/email-policy";
import {
  renderPaymentRefunded,
  renderRegistrationConfirmed,
  renderScoresReleased,
  renderTomorrowReminder,
  renderWaitlistInvite,
  renderWaitlistJoined,
  MOCK_EMAIL_HEADER_TOKEN,
  type MockEmailType,
  type RenderedMockEmail,
} from "@/lib/mockTest/email-templates";
import { WAITLIST_INVITE_MS } from "@/lib/mockTest/waitlist-policy";
import { captureAcedError } from "@/lib/monitoring";

const CLAIM_STALE_MS = 10 * 60_000;

const MOCK_EMAIL_HEADER_FILES: Record<MockEmailType, string> = {
  registration_confirmed: "header-in.gif",
  tomorrow_reminder: "header-tomorrow.gif",
  waitlist_invite: "header-seat-open.gif",
  waitlist_joined: "header-waitlist.gif",
  payment_refunded: "header-refund.gif",
  scores_released: "header-scores.gif",
};

export function getMockEmailHeaderFilename(type: MockEmailType) {
  return MOCK_EMAIL_HEADER_FILES[type];
}

export function getMockEmailHeaderSource(type: MockEmailType, nodeEnv = process.env.NODE_ENV) {
  const filename = getMockEmailHeaderFilename(type);
  return nodeEnv === "production"
    ? `${getMockEmailSiteBaseUrl()}/email/${filename}`
    : "cid:aced-header";
}

export function getMockEmailSiteBaseUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

export type QueueMockEmailInput = {
  mockTestId: string;
  registrationId?: string | null;
  sourceKey?: string | null;
  uniqueKey: string;
  recipientEmail: string;
  scheduledAt: Date;
  rendered: RenderedMockEmail;
};

export async function queueMockEmail(input: QueueMockEmailInput) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured.");
  const [row] = await db
    .insert(mockEmailOutbox)
    .values({
      mockTestId: input.mockTestId,
      registrationId: input.registrationId ?? null,
      sourceKey: input.sourceKey ?? null,
      emailType: input.rendered.type,
      uniqueKey: input.uniqueKey,
      recipientEmail: input.recipientEmail.toLowerCase(),
      scheduledAt: input.scheduledAt,
      subject: input.rendered.subject,
      htmlBody: input.rendered.html,
      textBody: input.rendered.text,
      attachments: input.rendered.attachments,
    })
    .onConflictDoNothing({ target: mockEmailOutbox.uniqueKey })
    .returning({ id: mockEmailOutbox.id });
  return { queued: Boolean(row), id: row?.id ?? null };
}

async function getRegistrationEmailContext(registrationId: string) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured.");
  const result = await db.execute(sql`
    select
      mr.id,
      mr.mock_test_id,
      mr.time_zone,
      mr.paid_at,
      mr.refunded_at,
      mr.composite,
      u.email,
      mt.status as test_status,
      mt.released_at
    from mock_registrations mr
    join users u on u.id=mr.user_id
    join mock_tests mt on mt.id=mr.mock_test_id
    where mr.id=${registrationId}
    limit 1
  `);
  return result.rows[0] as Record<string, unknown> | undefined;
}

export async function queueRegistrationConfirmedEmails(registrationId: string) {
  const row = await getRegistrationEmailContext(registrationId);
  if (!row || !row.paid_at || row.refunded_at) return;
  const timeZone = String(row.time_zone);
  const recipientEmail = String(row.email);
  const mockTestId = String(row.mock_test_id);
  const paidAt = new Date(String(row.paid_at));
  const mockTestUrl = `${getMockEmailSiteBaseUrl()}/mock-test`;
  const calendarUrl = `${getMockEmailSiteBaseUrl()}/api/mock-test/calendar?timeZone=${encodeURIComponent(timeZone)}`;

  await queueMockEmail({
    mockTestId,
    registrationId,
    uniqueKey: `registration_confirmed:${registrationId}`,
    recipientEmail,
    scheduledAt: paidAt,
    rendered: renderRegistrationConfirmed({ timeZone, calendarUrl }),
  });

  const reminderAt = getMockReminderAt(timeZone);
  if (paidAt.getTime() <= reminderAt.getTime()) {
    await queueMockEmail({
      mockTestId,
      registrationId,
      uniqueKey: `tomorrow_reminder:${registrationId}`,
      recipientEmail,
      scheduledAt: reminderAt,
      rendered: renderTomorrowReminder({ mockTestUrl }),
    });
  }
}

export async function queuePaymentRefundedEmail(registrationId: string) {
  const row = await getRegistrationEmailContext(registrationId);
  if (!row || !row.refunded_at) return;
  await queueMockEmail({
    mockTestId: String(row.mock_test_id),
    registrationId,
    uniqueKey: `payment_refunded:${registrationId}`,
    recipientEmail: String(row.email),
    scheduledAt: new Date(String(row.refunded_at)),
    rendered: renderPaymentRefunded({ practiceUrl: `${getMockEmailSiteBaseUrl()}/dashboard` }),
  });
}

export async function queueScoresReleasedEmail(registrationId: string) {
  const row = await getRegistrationEmailContext(registrationId);
  if (!row || row.refunded_at || row.composite == null || row.test_status !== "released") return;
  await queueMockEmail({
    mockTestId: String(row.mock_test_id),
    registrationId,
    uniqueKey: `scores_released:${registrationId}`,
    recipientEmail: String(row.email),
    scheduledAt: row.released_at ? new Date(String(row.released_at)) : new Date(),
    rendered: renderScoresReleased({ resultsUrl: `${getMockEmailSiteBaseUrl()}/mock-test/results` }),
  });
}

export async function queueWaitlistJoinedEmail(waitlistId: string) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured.");
  const [row] = await db
    .select({
      id: mockWaitlist.id,
      mockTestId: mockWaitlist.mockTestId,
      email: mockWaitlist.email,
      createdAt: mockWaitlist.createdAt,
    })
    .from(mockWaitlist)
    .where(eq(mockWaitlist.id, waitlistId))
    .limit(1);
  if (!row) return;
  await queueMockEmail({
    mockTestId: row.mockTestId,
    sourceKey: row.id,
    uniqueKey: `waitlist_joined:${row.id}`,
    recipientEmail: row.email,
    scheduledAt: row.createdAt,
    rendered: renderWaitlistJoined({ practiceUrl: `${getMockEmailSiteBaseUrl()}/dashboard` }),
  });
}

export async function queueWaitlistInviteEmail(input: {
  waitlistId: string;
  invitedAt: Date;
  token: string;
}) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured.");
  const [row] = await db
    .select({
      id: mockWaitlist.id,
      mockTestId: mockWaitlist.mockTestId,
      email: mockWaitlist.email,
      timeZone: mockWaitlist.timeZone,
    })
    .from(mockWaitlist)
    .where(eq(mockWaitlist.id, input.waitlistId))
    .limit(1);
  if (!row) return;
  const timeZone = row.timeZone || "America/Los_Angeles";
  await queueMockEmail({
    mockTestId: row.mockTestId,
    sourceKey: row.id,
    uniqueKey: `waitlist_invite:${row.id}:${input.invitedAt.toISOString()}`,
    recipientEmail: row.email,
    scheduledAt: input.invitedAt,
    rendered: renderWaitlistInvite({
      inviteUrl: `${getMockEmailSiteBaseUrl()}/mock-test/signup?invite=${encodeURIComponent(input.token)}`,
      expiresAt: new Date(input.invitedAt.getTime() + WAITLIST_INVITE_MS),
      timeZone,
    }),
  });
}

export async function reconcileMockTestEmailOutbox(slug: string) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured.");
  const result = await db.execute(sql`
    select mr.id, mr.paid_at, mr.refunded_at, mr.composite, mt.status
    from mock_registrations mr
    join mock_tests mt on mt.id=mr.mock_test_id
    where mt.slug=${slug}
  `);
  for (const row of result.rows as Array<Record<string, unknown>>) {
    const registrationId = String(row.id);
    if (row.paid_at && !row.refunded_at) await queueRegistrationConfirmedEmails(registrationId);
    if (row.refunded_at) await queuePaymentRefundedEmail(registrationId);
    if (row.status === "released" && row.composite != null && !row.refunded_at) {
      await queueScoresReleasedEmail(registrationId);
    }
  }

  const waitlistRows = await db.execute(sql`
    select mw.id, mw.created_at, mw.invited_at, mw.invite_token
    from mock_waitlist mw
    join mock_tests mt on mt.id=mw.mock_test_id
    where mt.slug=${slug}
  `);
  for (const row of waitlistRows.rows as Array<Record<string, unknown>>) {
    const waitlistId = String(row.id);
    const createdAt = row.created_at ? new Date(String(row.created_at)) : null;
    if (createdAt && createdAt.getUTCFullYear() >= 2026) {
      await queueWaitlistJoinedEmail(waitlistId);
    }
    if (row.invited_at && row.invite_token) {
      await queueWaitlistInviteEmail({
        waitlistId,
        invitedAt: new Date(String(row.invited_at)),
        token: String(row.invite_token),
      });
    }
  }
}

export async function processMockEmailOutbox(now = new Date()) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured.");
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured.");
  if (process.env.NODE_ENV !== "production" && !process.env.EMAIL_TEST_TO) {
    throw new Error("EMAIL_TEST_TO is required outside production.");
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const summary = { sent: 0, failed: 0, skipped: 0 };

  for (let index = 0; index < 50; index += 1) {
    const lockToken = crypto.randomUUID();
    const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS);
    const claimed = await db.execute(sql`
      with candidate as (
        select id
        from mock_email_outbox
        where sent_at is null
          and scheduled_at <= ${now}
          and attempts < ${MOCK_EMAIL_MAX_ATTEMPTS}
          and (locked_at is null or locked_at < ${staleBefore})
        order by scheduled_at asc, created_at asc
        for update skip locked
        limit 1
      )
      update mock_email_outbox o
      set locked_at=${now}, lock_token=${lockToken}, attempts=o.attempts+1,
          last_attempt_at=${now}, updated_at=${now}
      from candidate
      where o.id=candidate.id
      returning o.*
    `);
    const row = claimed.rows[0] as Record<string, unknown> | undefined;
    if (!row) break;

    const target = resolveEmailDeliveryTarget({
      realRecipient: String(row.recipient_email),
      subject: String(row.subject),
      nodeEnv: process.env.NODE_ENV,
      testRecipient: process.env.EMAIL_TEST_TO,
    });
    const storedAttachments = Array.isArray(row.attachments)
      ? (row.attachments as Array<{ filename: string; content: string; contentType?: string }>)
      : [];
    const emailType = String(row.email_type) as MockEmailType;
    const headerSource = getMockEmailHeaderSource(emailType);
    const html = String(row.html_body).replace(MOCK_EMAIL_HEADER_TOKEN, headerSource);
    const attachments: Array<{
      filename: string;
      content: string | Buffer;
      contentType?: string;
      contentId?: string;
    }> = [...storedAttachments];
    if (process.env.NODE_ENV !== "production") {
      const filename = getMockEmailHeaderFilename(emailType);
      attachments.push({
        filename,
        content: fs.readFileSync(path.join(process.cwd(), "public", "email", filename)),
        contentType: "image/gif",
        contentId: "aced-header",
      });
    }

    try {
      const response = await resend.emails.send(
        {
          from: `Aced <${MOCK_EMAIL_FROM}>`,
          replyTo: MOCK_EMAIL_SUPPORT,
          to: target.to,
          subject: target.subject,
          html,
          text: String(row.text_body),
          attachments,
        },
        { idempotencyKey: String(row.unique_key) }
      );
      if (response.error) throw new Error(response.error.message);
      await db
        .update(mockEmailOutbox)
        .set({
          sentAt: new Date(),
          providerMessageId: response.data?.id ?? null,
          lastError: null,
          lockedAt: null,
          lockToken: null,
          updatedAt: new Date(),
        })
        .where(and(eq(mockEmailOutbox.id, String(row.id)), eq(mockEmailOutbox.lockToken, lockToken)));
      summary.sent += 1;
    } catch (error) {
      captureAcedError(error, "email-outbox");
      await db
        .update(mockEmailOutbox)
        .set({
          lastError: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
          lockedAt: null,
          lockToken: null,
          updatedAt: new Date(),
        })
        .where(and(eq(mockEmailOutbox.id, String(row.id)), eq(mockEmailOutbox.lockToken, lockToken)));
      summary.failed += 1;
    }
  }
  return summary;
}

export async function getFailedMockEmailCount(mockTestId: string) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured.");
  const result = await db.execute(sql`
    select count(*)::int as count
    from mock_email_outbox
    where mock_test_id=${mockTestId}::uuid
      and sent_at is null
      and attempts >= ${MOCK_EMAIL_MAX_ATTEMPTS}
  `);
  return Number((result.rows[0] as { count?: unknown } | undefined)?.count ?? 0);
}
