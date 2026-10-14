import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { accountDeletionRequests, users } from "@/db/schema";
import { getAdminSession } from "@/lib/admin";
import { getDb } from "@/lib/db";

export const metadata = { title: "Deletion Requests · ACED Admin", robots: { index: false, follow: false } };

export default async function DeletionRequestsPage() {
  if (!await getAdminSession()) redirect("/");
  const db = getDb();
  const rows = db ? await db.select({ id: accountDeletionRequests.id, status: accountDeletionRequests.status, requestedAt: accountDeletionRequests.requestedAt, email: users.email }).from(accountDeletionRequests).innerJoin(users, eq(users.id, accountDeletionRequests.userId)).orderBy(desc(accountDeletionRequests.requestedAt)).limit(300) : [];
  return <main style={{ maxWidth: 960, margin: "0 auto", padding: 32 }}><h1>Account deletion requests</h1><p>These are requests only. No account is deleted automatically.</p><table><thead><tr><th>Email</th><th>Status</th><th>Requested</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.email}</td><td>{row.status}</td><td>{row.requestedAt.toISOString()}</td></tr>)}</tbody></table></main>;
}
