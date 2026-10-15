import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { accountDeletionRequests, users } from "@/db/schema";
import { getAdminSession } from "@/lib/admin";
import { getDb } from "@/lib/db";
import DeletionRequestsClient from "./deletion-requests-client";

export const metadata = { title: "Deletion Requests · ACED Admin", robots: { index: false, follow: false } };

export default async function DeletionRequestsPage() {
  if (!await getAdminSession()) redirect("/");
  const db = getDb();
  const rows = db ? await db.select({ id: accountDeletionRequests.id, status: accountDeletionRequests.status, identityVerificationStatus: accountDeletionRequests.identityVerificationStatus, internalNote: accountDeletionRequests.internalNote, requestedAt: accountDeletionRequests.requestedAt, reviewedAt: accountDeletionRequests.reviewedAt, lastStatusUpdatedAt: accountDeletionRequests.lastStatusUpdatedAt, email: users.email }).from(accountDeletionRequests).innerJoin(users, eq(users.id, accountDeletionRequests.userId)).orderBy(desc(accountDeletionRequests.requestedAt)).limit(300) : [];
  const serializedRows = rows.map((row) => ({ ...row, requestedAt: row.requestedAt.toISOString(), reviewedAt: row.reviewedAt?.toISOString() ?? null, lastStatusUpdatedAt: row.lastStatusUpdatedAt?.toISOString() ?? null }));
  return <main style={{ maxWidth: 960, margin: "0 auto", padding: 32 }}><h1>Account deletion requests</h1><DeletionRequestsClient initialRows={serializedRows} /></main>;
}
