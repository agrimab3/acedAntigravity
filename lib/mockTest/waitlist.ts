import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { mockWaitlist } from "@/db/schema";
import { getDb } from "@/lib/db";

export function normalizeWaitlistEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function getInviteByToken(inviteToken: string | null | undefined) {
  if (!inviteToken) return null;
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

  if (!invite?.invitedAt || invite.inviteUsedAt) return null;
  // TODO(mock-test-invite-expiry): add a 48-hour invite expiry before launch.
  return invite;
}

export async function validateInviteForUser(input: {
  inviteToken?: string | null;
  mockTestId: string;
  userId: string;
  email: string;
}) {
  const invite = await getInviteByToken(input.inviteToken);
  if (!invite || invite.mockTestId !== input.mockTestId) return null;
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
