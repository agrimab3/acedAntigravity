import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { accountDeletionExecutionEvents, accountDeletionExecutions, accountDeletionRequests } from "@/db/schema";
import { getDeletionDryRunInventory } from "@/lib/account-deletion-dry-run";
import { blockingKeys, buildDeletionExecutionPlan, deletionExecutionPlanDigest, type DeletionExecutionPlan } from "@/lib/account-deletion-execution";
import { getAdminSession } from "@/lib/admin";
import { getDb } from "@/lib/db";

const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function adminEmail(session: Awaited<ReturnType<typeof getAdminSession>>) {
  return session?.user?.email?.trim().toLowerCase() ?? null;
}

function serialize(record: typeof accountDeletionExecutions.$inferSelect) {
  return {
    id: record.id,
    deletionRequestId: record.deletionRequestId,
    status: record.status,
    planVersion: record.planVersion,
    planDigest: record.planDigest,
    frozenPlan: record.frozenPlan as unknown as DeletionExecutionPlan,
    blockerKeys: record.blockerKeys,
    preparedAt: record.preparedAt.toISOString(),
    finalAuthorizedAt: record.finalAuthorizedAt?.toISOString() ?? null,
    failureCode: record.failureCode,
  };
}

async function findVerifiedRequest(db: NonNullable<ReturnType<typeof getDb>>, requestId: string) {
  const [request] = await db
    .select({ id: accountDeletionRequests.id, userId: accountDeletionRequests.userId, status: accountDeletionRequests.status, identityVerificationStatus: accountDeletionRequests.identityVerificationStatus })
    .from(accountDeletionRequests)
    .where(eq(accountDeletionRequests.id, requestId))
    .limit(1);
  if (!request) return null;
  if (request.status === "completed" || request.identityVerificationStatus !== "verified") return "not_ready" as const;
  return request;
}

export async function GET(_request: Request, context: { params: Promise<{ requestId: string }> }) {
  if (!await getAdminSession()) return new NextResponse("Not Found", { status: 404 });
  const { requestId } = await context.params;
  if (!requestIdPattern.test(requestId)) return new NextResponse("Not Found", { status: 404 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const [record] = await db.select().from(accountDeletionExecutions).where(eq(accountDeletionExecutions.deletionRequestId, requestId)).limit(1);
  if (!record) return new NextResponse("Not Found", { status: 404 });
  return NextResponse.json({ execution: serialize(record), destructiveExecutionEnabled: false });
}

/** Creates or returns one frozen, non-destructive plan for a verified request. */
export async function POST(_request: Request, context: { params: Promise<{ requestId: string }> }) {
  const session = await getAdminSession();
  const actorAdminEmail = adminEmail(session);
  if (!session || !actorAdminEmail) return new NextResponse("Not Found", { status: 404 });
  const { requestId } = await context.params;
  if (!requestIdPattern.test(requestId)) return new NextResponse("Not Found", { status: 404 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const deletionRequest = await findVerifiedRequest(db, requestId);
  if (!deletionRequest) return new NextResponse("Not Found", { status: 404 });
  if (deletionRequest === "not_ready") return NextResponse.json({ error: "A plan requires an open, identity-verified deletion request." }, { status: 409 });

  // Aggregate-only inventory; no student record contents are included in the plan.
  const inventory = await getDeletionDryRunInventory(db, deletionRequest.userId);
  const plan = buildDeletionExecutionPlan(inventory);
  const blockerKeys = blockingKeys(plan);
  const planDigest = deletionExecutionPlanDigest(plan);
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(accountDeletionExecutions)
      .where(eq(accountDeletionExecutions.deletionRequestId, requestId)).limit(1);
    if (existing) return { record: existing, created: false };

    const [created] = await tx.insert(accountDeletionExecutions).values({
      deletionRequestId: requestId,
      targetUserId: deletionRequest.userId,
      status: blockerKeys.length ? "blocked" : "awaiting_final_authorization",
      planVersion: plan.version,
      planDigest,
      frozenPlan: plan,
      blockerKeys,
      preparedByAdminEmail: actorAdminEmail,
      preparedAt: now,
      failureCode: blockerKeys.length ? "BLOCKERS_PRESENT" : null,
      updatedAt: now,
    }).onConflictDoNothing().returning();
    if (!created) {
      const [concurrent] = await tx.select().from(accountDeletionExecutions)
        .where(eq(accountDeletionExecutions.deletionRequestId, requestId)).limit(1);
      if (!concurrent) throw new Error("Could not create a deletion execution plan.");
      return { record: concurrent, created: false };
    }
    await tx.insert(accountDeletionExecutionEvents).values({
      executionId: created.id,
      eventType: blockerKeys.length ? "plan_prepared_blocked" : "plan_prepared",
      actorAdminEmail,
      details: { planVersion: plan.version, blockerCount: blockerKeys.length },
    });
    return { record: created, created: true };
  });

  return NextResponse.json({ execution: serialize(result.record), created: result.created, destructiveExecutionEnabled: false });
}
