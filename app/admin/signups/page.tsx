import { desc } from "drizzle-orm";
import { joinRequests, waitlistSignups } from "@/db/schema";
import { getDb } from "@/lib/db";
import { requireMockTestAdminPage } from "@/lib/admin/mockTestAdmin";

export const metadata = { title: "Public Signups · ACED Admin", robots: { index: false, follow: false } };

export default async function SignupsPage() {
  await requireMockTestAdminPage();
  const db = getDb();
  if (!db) throw new Error("Database unavailable.");
  const [waitlist, joins] = await Promise.all([
    db.select().from(waitlistSignups).orderBy(desc(waitlistSignups.createdAt)),
    db.select().from(joinRequests).orderBy(desc(joinRequests.createdAt)),
  ]);
  const when = (date: Date) => date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  return <main className="policyPage"><article className="policyCard" style={{ maxWidth: 1080 }}><p className="policyEyebrow">Aced admin</p><h1>Public signups</h1><h2>Waitlist ({waitlist.length})</h2><table><thead><tr><th>Email</th><th>Created</th></tr></thead><tbody>{waitlist.map((row) => <tr key={row.id}><td>{row.email}</td><td>{when(row.createdAt)}</td></tr>)}</tbody></table><h2>Join requests ({joins.length})</h2><table><thead><tr><th>Name</th><th>Email</th><th>Roles</th><th>Note</th><th>Created</th></tr></thead><tbody>{joins.map((row) => <tr key={row.id}><td>{row.firstName}</td><td>{row.email}</td><td>{row.roles.join(", ")}</td><td>{row.note ?? "—"}</td><td>{when(row.createdAt)}</td></tr>)}</tbody></table></article></main>;
}
