import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { accountDeletionRequests } from "@/db/schema";
import { getDeletionDryRunInventory } from "@/lib/account-deletion-dry-run";
import { getAdminSession } from "@/lib/admin";
import { getDb } from "@/lib/db";

const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Read-only Phase 1 endpoint. The user is derived exclusively from a verified
 * deletion request; callers can never submit an arbitrary user ID or email.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  if (!await getAdminSession()) return new NextResponse("Not Found", { status: 404 });
  const { requestId } = await context.params;
  if (!requestIdPattern.test(requestId)) return new NextResponse("Not Found", { status: 404 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const [deletionRequest] = await db
    .select({
      userId: accountDeletionRequests.userId,
      status: accountDeletionRequests.status,
      identityVerificationStatus: accountDeletionRequests.identityVerificationStatus,
    })
    .from(accountDeletionRequests)
    .where(eq(accountDeletionRequests.id, requestId))
    .limit(1);
  if (!deletionRequest) return new NextResponse("Not Found", { status: 404 });
  if (deletionRequest.status === "completed" || deletionRequest.identityVerificationStatus !== "verified") {
    return NextResponse.json({ error: "A dry run is available only for an open, identity-verified deletion request." }, { status: 409 });
  }

  const inventory = await getDeletionDryRunInventory(db, deletionRequest.userId);
  return NextResponse.json({
    dryRunOnly: true,
    request: { id: requestId, status: deletionRequest.status },
    inventory,
  });
}
