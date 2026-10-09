import { and, eq, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { mockRegistrations } from "@/db/schema";
import { getDb } from "@/lib/db";

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

  const result = await db.execute(sql`
    SELECT
      mt.seat_limit AS "limit",
      COUNT(mr.id) FILTER (
        WHERE mr.paid_at IS NOT NULL
           OR (mr.hold_expires_at IS NOT NULL AND mr.hold_expires_at > NOW())
      )::int AS "taken"
    FROM mock_tests mt
    LEFT JOIN mock_registrations mr ON mr.mock_test_id = mt.id
    WHERE mt.id = ${mockTestId}
    GROUP BY mt.id, mt.seat_limit
  `);

  const row = result.rows[0] as { limit?: unknown; taken?: unknown } | undefined;
  if (!row) throw new Error("Mock test not found.");

  const limit = toNumber(row.limit);
  const taken = toNumber(row.taken);
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
      SELECT id, seat_limit
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

    // Phase 3: set hasValidInvite=true only after validating that the invite
    // token belongs to the signed-in student email.
    if (!hasActiveHold && !input.hasValidInvite) {
      const countResult = await tx.execute(sql`
        SELECT COUNT(*)::int AS "taken"
        FROM mock_registrations
        WHERE mock_test_id = ${input.mockTestId}
          AND (
            paid_at IS NOT NULL
            OR (hold_expires_at IS NOT NULL AND hold_expires_at > NOW())
          )
      `);

      const taken = toNumber((countResult.rows[0] as { taken?: unknown } | undefined)?.taken);
      const limit = toNumber((lockedTest.rows[0] as { seat_limit?: unknown }).seat_limit);
      if (taken >= limit) throw new MockTestSeatsFullError();
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

    return { id: registration.id, alreadyPaid: false as const, holdExpiresAt };
  });
}
