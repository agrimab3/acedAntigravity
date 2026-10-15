import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { accountDeletionExecutionEvents, accountDeletionExecutions, accountDeletionRequests } from "@/db/schema";
import { getDeletionDryRunInventory } from "@/lib/account-deletion-dry-run";
import { blockingKeys, buildDeletionExecutionPlan, canRecordFinalAuthorization, deletionExecutionPlanDigest, type DeletionExecutionPlan } from "@/lib/account-deletion-execution";
import { getAdminSession } from "@/lib/admin";
import { getDb } from "@/lib/db";

const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Final authorization is intentionally non-operative in Phase 2. It performs
 * freshness and separation checks, records only a safe blocked event, and
 * never enables or performs destructive execution.
 */
export async function POST(_request: Request, context: { params: Promise<{ requestId: string }> }) {
  const session = await getAdminSession();
  const actorAdminEmail = session?.user?.email?.trim().toLowerCase() ?? null;
  if (!session || !actorAdminEmail) return new NextResponse("Not Found", { status: 404 });
  const { requestId } = await context.params;
  if (!requestIdPattern.test(requestId)) return new NextResponse("Not Found", { status: 404 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const [record] = await db.select().from(accountDeletionExecutions)
    .where(eq(accountDeletionExecutions.deletionRequestId, requestId)).limit(1);
  if (!record) return new NextResponse("Not Found", { status: 404 });
  const [deletionRequest] = await db.select({ userId: accountDeletionRequests.userId, status: accountDeletionRequests.status, identityVerificationStatus: accountDeletionRequests.identityVerificationStatus })
    .from(accountDeletionRequests).where(eq(accountDeletionRequests.id, requestId)).limit(1);
  if (!deletionRequest || deletionRequest.userId !== record.targetUserId || deletionRequest.status === "completed" || deletionRequest.identityVerificationStatus !== "verified") {
    return NextResponse.json({ error: "The request binding is no longer eligible for authorization." }, { status: 409 });
  }

  const currentPlan = buildDeletionExecutionPlan(await getDeletionDryRunInventory(db, deletionRequest.userId));
  const currentBlockers = blockingKeys(currentPlan);
  const planDigestMatches = deletionExecutionPlanDigest(currentPlan) === record.planDigest;
  const eligible = canRecordFinalAuthorization({ preparedByAdminEmail: record.preparedByAdminEmail, authorizingAdminEmail: actorAdminEmail, blockerKeys: currentBlockers, planDigestMatches });
  const failureCode = !planDigestMatches ? "STALE_PLAN" : record.preparedByAdminEmail === actorAdminEmail ? "SEPARATION_REQUIRED" : currentBlockers.length ? "BLOCKERS_PRESENT" : "EXECUTION_DISABLED";

  await db.transaction(async (tx) => {
    await tx.update(accountDeletionExecutions).set({ status: "blocked", blockerKeys: currentBlockers, failureCode: eligible ? "EXECUTION_DISABLED" : failureCode, updatedAt: new Date() })
      .where(eq(accountDeletionExecutions.id, record.id));
    await tx.insert(accountDeletionExecutionEvents).values({
      executionId: record.id,
      eventType: "final_authorization_blocked",
      actorAdminEmail,
      details: { reasonCode: eligible ? "EXECUTION_DISABLED" : failureCode, planVersion: (record.frozenPlan as unknown as DeletionExecutionPlan).version },
    });
  });
  return NextResponse.json({ error: "Final authorization and all destructive execution remain disabled pending separate owner authorization and resolved retention requirements.", code: eligible ? "EXECUTION_DISABLED" : failureCode }, { status: 409 });
}
