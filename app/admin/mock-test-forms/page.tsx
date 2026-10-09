import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin";
import FormConsole from "./form-console";

export default async function MockTestFormsAdminPage() {
  const session = await getAdminSession();
  if (!session) redirect("/");

  return (
    <main style={{ minHeight: "100vh", background: "#07101d", color: "#fff", padding: "32px 20px", fontFamily: "DM Sans, sans-serif" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: ".08em", color: "rgba(255,255,255,.45)" }}>ACED MOCK TEST OPS</div>
            <h1 style={{ margin: "6px 0 4px", fontSize: 34, fontWeight: 500 }}>form audit & locking</h1>
            <div style={{ color: "rgba(255,255,255,.52)", fontSize: 13 }}>signed in as {session.user?.email}</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Link href="/admin/review" style={{ color: "#d8efe7", textDecoration: "none" }}>review queue</Link>
            <Link href="/dashboard" style={{ color: "#d8efe7", textDecoration: "none" }}>dashboard</Link>
          </div>
        </div>
        <FormConsole />
      </div>
    </main>
  );
}
