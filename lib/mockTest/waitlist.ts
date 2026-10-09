import crypto from "node:crypto";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { mockWaitlist } from "@/db/schema";
import { getDb } from "@/lib/db";
import { queueWaitlistInviteEmail } from "@/lib/mockTest/email-outbox";
import { MOCK_TEST_SEAT_CAP } from "@/lib/mockTest/seat-policy";
import {
  isWaitlistInviteExpired,
  selectWaitlistHandoffCandidates,
  WAITLIST_INVITE_MS,
} from "@/lib/mockTest/waitlist-policy";

export { isWaitlistInviteExpired, selectWaitlistHandoffCandidates } from "@/lib/mockTest/waitlist-policy";

export function normalizeWaitlistEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function reconcileWaitlistInvites(mockTestId: string, now = new Date()) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured.");

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from mock_tests where id=${mockTestId} for update`);

    const expiredRows = await tx.execute(sql`
      select id, email
      from mock_waitlist
      where mock_test_id=${mockTestId}
        and invited_at is not null
        and invite_used_at is null
        and invited_at <= ${new Date(now.getTime() - WAITLIST_INVITE_MS)}
      order by invited_at asc, id asc
      for update
    `);
    const expired = expiredRows.rows as Array<{ id: string; email: string }>;

    for (const row of expired) {
      await tx
        .update(mockWaitlist)
        .set({ invitedAt: null, createdAt: now })
        .where(eq(mockWaitlist.id, row.id));
    }

    const occupiedResult = await tx.execute(sql`
      select
        (
          select count(*)::int
          from mock_registrations
          where mock_test_id=${mockTestId}
            and (
              paid_at is not null
              or (hold_expires_at is not null and hold_expires_at > ${now})
            )
        ) + (
          select count(*)::int
          from mock_waitlist
          where mock_test_id=${mockTestId}
            and invited_at is not null
            and invite_used_at is null
            and invited_at > ${new Date(now.getTime() - WAITLIST_INVITE_MS)}
        ) as occupied
    `);
    const occupied = Number(
      (occupiedResult.rows[0] as { occupied?: unknown } | undefined)?.occupied ?? 0
    );
    const available = Math.max(0, MOCK_TEST_SEAT_CAP - occupied);
    if (available <= 0) return { expired, invitations: [] as Array<{ id: string; email: string; token: string; invitedAt: Date }> };

    const expiredIds = new Set(expired.map((row) => row.id));
    const candidatesResult = await tx.execute(sql`
      select id, email
      from mock_waitlist
      where mock_test_id=${mockTestId}
        and invited_at is null
        and invite_used_at is null
      order by created_at asc, id asc
      for update skip locked
    `);

    const candidates = selectWaitlistHandoffCandidates(
      candidatesResult.rows as Array<{ id: string; email: string }>,
      expiredIds,
      available
    );

    const invitations: Array<{ id: string; email: string; token: string; invitedAt: Date }> = [];
    for (const row of candidates) {
      const token = crypto.randomBytes(24).toString("hex");
      await tx
        .update(mockWaitlist)
        .set({ invitedAt: now, inviteToken: token })
        .where(eq(mockWaitlist.id, row.id));
      invitations.push({ id: row.id, email: row.email, token, invitedAt: now });
    }

    return { expired, invitations };
  });

  for (const invitation of result.invitations) {
    try {
      await queueWaitlistInviteEmail({
        waitlistId: invitation.id,
        invitedAt: invitation.invitedAt,
        token: invitation.token,
      });
    } catch (error) {
      console.error("[mock-test email] failed to queue waitlist invite", {
        waitlistId: invitation.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

export type InviteLookup =
  | { status: "valid"; invite: { id: string; mockTestId: string; email: string; invitedAt: Date; inviteUsedAt: Date | null } }
  | { status: "expired"; email: string; mockTestId: string }
  | { status: "invalid" };

export async function getInviteStatusByToken(
  inviteToken: string | null | undefined,
  now = new Date()
): Promise<InviteLookup> {
  if (!inviteToken) return { status: "invalid" };
  const db = getDb();
  if (!db) throw new Error("Database is not configured.");

  const [invite] = await db
    .select({
      id: mockWaitlist.id,
      mockTestId: mockWaitlist.mockTestId,
      email: mockWaitlist.email,
      invitedAt: mockWaitlist.invitedAt,
      inviteUsedAt: mockWaitlist.inviteUsedAt,
    })
    .from(mockWaitlist)
    .where(eq(mockWaitlist.inviteToken, inviteToken))
    .limit(1);

  if (!invite || invite.inviteUsedAt) return { status: "invalid" };

  if (!invite.invitedAt || isWaitlistInviteExpired(invite.invitedAt, now)) {
    await reconcileWaitlistInvites(invite.mockTestId, now);
    return { status: "expired", email: invite.email, mockTestId: invite.mockTestId };
  }

  return {
    status: "valid",
    invite: {
      ...invite,
      invitedAt: invite.invitedAt,
    },
  };
}

export async function getInviteByToken(inviteToken: string | null | undefined) {
  const lookup = await getInviteStatusByToken(inviteToken);
  return lookup.status === "valid" ? lookup.invite : null;
}

export async function validateInviteForUser(input: {
  inviteToken?: string | null;
  mockTestId: string;
  userId: string;
  email: string;
}) {
  const lookup = await getInviteStatusByToken(input.inviteToken);
  if (lookup.status !== "valid") return null;
  const invite = lookup.invite;
  if (invite.mockTestId !== input.mockTestId) return null;
  if (normalizeWaitlistEmail(invite.email) !== normalizeWaitlistEmail(input.email)) return null;

  const db = getDb();
  if (!db) throw new Error("Database is not configured.");
  await db
    .update(mockWaitlist)
    .set({ userId: input.userId })
    .where(
      and(
        eq(mockWaitlist.id, invite.id),
        isNotNull(mockWaitlist.invitedAt),
        isNull(mockWaitlist.inviteUsedAt)
      )
    );

  return invite;
}

export async function findWaitlistEntry(mockTestId: string, email: string) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured.");
  const normalizedEmail = normalizeWaitlistEmail(email);
  const [entry] = await db
    .select({ id: mockWaitlist.id, email: mockWaitlist.email })
    .from(mockWaitlist)
    .where(
      and(
        eq(mockWaitlist.mockTestId, mockTestId),
        eq(mockWaitlist.email, normalizedEmail)
      )
    )
    .limit(1);
  return entry ?? null;
}
