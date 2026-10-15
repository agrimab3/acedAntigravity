import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { accountDeletionRequests } from "@/db/schema";
import {
  canTransitionDeletionRequest,
  deletionRequestStatuses,
  identityVerificationStatuses,
  type DeletionRequestStatus,
} from "@/lib/account-deletion-workflow";
import { getAdminSession } from "@/lib/admin";
import { getDb } from "@/lib/db";

const updateSchema = z.object({
  status: z.enum(deletionRequestStatuses).optional(),
  identityVerificationStatus: z.enum(identityVerificationStatuses).optional(),
  internalNote: z.string().trim().max(2000).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "Provide an update.");

export async function PATCH(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  // Never reveal deletion-request existence to unauthenticated users.
  if (!await getAdminSession()) return new NextResponse("Not Found", { status: 404 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid review update." }, { status: 400 });
  const { requestId } = await context.params;
  const [existing] = await db
    .select({
      status: accountDeletionRequests.status,
      identityVerificationStatus: accountDeletionRequests.identityVerificationStatus,
      identityVerifiedAt: accountDeletionRequests.identityVerifiedAt,
    })
    .from(accountDeletionRequests)
    .where(eq(accountDeletionRequests.id, requestId))
    .limit(1);
  if (!existing) return new NextResponse("Not Found", { status: 404 });

  const nextStatus = parsed.data.status ?? (existing.status as DeletionRequestStatus);
  if (!canTransitionDeletionRequest(existing.status as DeletionRequestStatus, nextStatus)) {
    return NextResponse.json(
      { error: "This request cannot be marked completed by the review workflow." },
      { status: 409 },
    );
  }

  const now = new Date();
  const nextVerification = parsed.data.identityVerificationStatus ?? existing.identityVerificationStatus;
  const [updated] = await db
    .update(accountDeletionRequests)
    .set({
      status: nextStatus,
      identityVerificationStatus: nextVerification,
      identityVerifiedAt: parsed.data.identityVerificationStatus === undefined
        ? existing.identityVerifiedAt
        : nextVerification === "verified" ? now : null,
      internalNote: parsed.data.internalNote,
      reviewedAt: nextStatus === "requested" ? undefined : now,
      lastStatusUpdatedAt: now,
    })
    .where(eq(accountDeletionRequests.id, requestId))
    .returning({
      id: accountDeletionRequests.id,
      status: accountDeletionRequests.status,
      identityVerificationStatus: accountDeletionRequests.identityVerificationStatus,
      lastStatusUpdatedAt: accountDeletionRequests.lastStatusUpdatedAt,
    });

  return NextResponse.json({ request: updated });
}
