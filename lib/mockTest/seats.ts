import { and, eq, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { mockRegistrations, mockWaitlist } from "@/db/schema";
import { getDb } from "@/lib/db";
import { MOCK_TEST_SEAT_CAP } from "@/lib/mockTest/seat-policy";
import { WAITLIST_INVITE_MS } from "@/lib/mockTest/waitlist-policy";
import { reconcileWaitlistInvites } from "@/lib/mockTest/waitlist";

const HOLD_MINUTES = 15;

export type SeatStatus = {
  limit: number;
  taken: number;
  remaining: number;
  isFull: boolean;
};

export class MockTestSeatsFullError extends Error {
  readonly code = "SEATS_FULL";

  constructor() {
    super("Seats just filled up. You can join the waitlist.");
    this.name = "MockTestSeatsFullError";
  }
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

export async function getSeatStatus(mockTestId: string): Promise<SeatStatus> {
  const db = getDb();
  if (!db) throw new Error("Database is not configured.");

  await reconcileWaitlistInvites(mockTestId);
  const cutoff = new Date(Date.now() - WAITLIST_INVITE_MS);
  const result = await db.execute(sql`
    SELECT
      (
        SELECT COUNT(*)::int
        FROM mock_registrations mr
        WHERE mr.mock_test_id = ${mockTestId}
          AND (
            mr.paid_at IS NOT NULL
            OR (mr.hold_expires_at IS NOT NULL AND mr.hold_expires_at > NOW())
          )
      ) + (
        SELECT COUNT(*)::int
        FROM mock_waitlist mw
        WHERE mw.mock_test_id = ${mockTestId}
          AND mw.invited_at IS NOT NULL
          AND mw.invite_used_at IS NULL
          AND mw.invited_at > ${cutoff}
      ) AS "taken"
  `);

  const row = result.rows[0] as { taken?: unknown } | undefined;
  const limit = MOCK_TEST_SEAT_CAP;
  const taken = Math.min(limit, toNumber(row?.taken));
  const remaining = Math.max(0, limit - taken);
  return { limit, taken, remaining, isFull: remaining <= 0 };
}

export const getSeatStatusCached = unstable_cache(
  async (mockTestId: string) => getSeatStatus(mockTestId),
  ["mock-test-seat-status"],
  { revalidate: 30 }
);

type CreateSeatHoldInput = {
  mockTestId: string;
  userId: string;
  timeZone: string;
  agreedNoRefundAt: Date;
  marketingOptIn: boolean;
  hasValidInvite?: boolean;
};

export async function createSeatHold(input: CreateSeatHoldInput) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured.");

  return db.transaction(async (tx) => {
    const lockedTest = await tx.execute(sql`
      SELECT id
      FROM mock_tests
      WHERE id = ${input.mockTestId}
      FOR UPDATE
    `);

    if (lockedTest.rows.length === 0) throw new Error("Mock test not found.");

    const [existing] = await tx
      .select({
        id: mockRegistrations.id,
        paidAt: mockRegistrations.paidAt,
        holdExpiresAt: mockRegistrations.holdExpiresAt,
      })
      .from(mockRegistrations)
      .where(and(
        eq(mockRegistrations.mockTestId, input.mockTestId),
        eq(mockRegistrations.userId, input.userId)
      ))
      .limit(1);

    if (existing?.paidAt) return { id: existing.id, alreadyPaid: true as const };

    const now = new Date();
    const hasActiveHold = Boolean(
      existing?.holdExpiresAt && existing.holdExpiresAt.getTime() > now.getTime()
    );

    if (!hasActiveHold && !input.hasValidInvite) {
      const cutoff = new Date(now.getTime() - WAITLIST_INVITE_MS);
      const countResult = await tx.execute(sql`
        SELECT
          (
            SELECT COUNT(*)::int
            FROM mock_registrations
            WHERE mock_test_id = ${input.mockTestId}
              AND (
                paid_at IS NOT NULL
                OR (hold_expires_at IS NOT NULL AND hold_expires_at > ${now})
              )
          ) + (
            SELECT COUNT(*)::int
            FROM mock_waitlist
            WHERE mock_test_id = ${input.mockTestId}
              AND invited_at IS NOT NULL
              AND invite_used_at IS NULL
              AND invited_at > ${cutoff}
          ) AS "taken"
      `);

      const taken = toNumber((countResult.rows[0] as { taken?: unknown } | undefined)?.taken);
      if (taken >= MOCK_TEST_SEAT_CAP) throw new MockTestSeatsFullError();
    }

    const holdExpiresAt = new Date(now.getTime() + HOLD_MINUTES * 60_000);
    const [registration] = await tx
      .insert(mockRegistrations)
      .values({
        mockTestId: input.mockTestId,
        userId: input.userId,
        timeZone: input.timeZone,
        agreedNoRefundAt: input.agreedNoRefundAt,
        marketingOptIn: input.marketingOptIn,
        holdExpiresAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [mockRegistrations.mockTestId, mockRegistrations.userId],
        set: {
          timeZone: input.timeZone,
          agreedNoRefundAt: input.agreedNoRefundAt,
          marketingOptIn: input.marketingOptIn,
          holdExpiresAt,
          updatedAt: now,
        },
      })
      .returning({ id: mockRegistrations.id });

    if (input.hasValidInvite) {
      await tx
        .update(mockWaitlist)
        .set({ inviteUsedAt: now })
        .where(
          and(
            eq(mockWaitlist.mockTestId, input.mockTestId),
            eq(mockWaitlist.userId, input.userId)
          )
        );
    }

    return { id: registration.id, alreadyPaid: false as const, holdExpiresAt };
  });
}
