import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { requireMockTestAdminPage } from "@/lib/admin/mockTestAdmin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Students · ACED Admin", robots: { index: false, follow: false } };

type Row = {
  email: string | null; name: string | null; grade_level: string | null; act_test_date: string | null;
  created_at: Date | string; finished_setup: boolean; email_opt_in: boolean; drills: number; tests: number; questions: number;
  seconds: number; last_active: Date | string | null;
};

const PT = "America/Los_Angeles";
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: PT }).format(d);
const when = (v: Date | string | null) => v ? new Date(v).toLocaleString("en-US", { timeZone: PT, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
const minutes = (s: number) => s >= 3600 ? `${Math.round((s / 3600) * 10) / 10} h` : `${Math.round(s / 60)} min`;

function ago(v: Date | string | null, now: number) {
  if (!v) return "never";
  const m = Math.floor((now - new Date(v).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)} min ago`;
  if (m < 1440) return `${Math.floor(m / 60)} h ago`;
  return `${Math.floor(m / 1440)} d ago`;
}

async function loadStudents() {
  const db = getDb();
  if (!db) throw new Error("Database unavailable.");
  const result = await db.execute(sql`
    select u.email, coalesce(u.preferred_name, u.name) as name, u.grade_level, u.act_test_date, u.created_at,
           (u.onboarding_completed_at is not null) as finished_setup, u.email_opt_in,
           coalesce(d.drills, 0)::int as drills, coalesce(t.tests, 0)::int as tests,
           (coalesce(d.q, 0) + coalesce(t.q, 0))::int as questions,
           (coalesce(d.secs, 0) + coalesce(t.secs, 0))::int as seconds,
           greatest(d.last, t.last) as last_active
    from users u
    left join (select user_id, count(*) drills, sum(question_count) q, sum(duration_seconds) secs, max(completed_at) last
               from practice_sessions where completed_at is not null group by user_id) d on d.user_id = u.id
    left join (select user_id, count(*) tests, sum(answered_count) q, sum(duration_seconds) secs, max(completed_at) last
               from practice_test_sessions where completed_at is not null group by user_id) t on t.user_id = u.id
    order by u.created_at desc`);
  return { rows: result.rows as Row[], now: Date.now() };
}

export default async function StudentsAdminPage() {
  await requireMockTestAdminPage();
  const { rows, now } = await loadStudents();
  const today = dayKey(new Date(now));
  const weekAgo = now - 7 * 86400000;
  const joinedToday = rows.filter((r) => dayKey(new Date(r.created_at)) === today).length;
  const joinedWeek = rows.filter((r) => new Date(r.created_at).getTime() >= weekAgo).length;
  const activeWeek = rows.filter((r) => r.last_active && new Date(r.last_active).getTime() >= weekAgo).length;
  const practicedEver = rows.filter((r) => r.questions > 0).length;
  const totalQuestions = rows.reduce((sum, r) => sum + Number(r.questions), 0);
  const optedIn = rows.filter((r) => r.email_opt_in).length;
  const tiles = [["Students", rows.length], ["Joined today", joinedToday], ["Joined this week", joinedWeek], ["Practiced this week", activeWeek], ["Ever practiced", practicedEver], ["Questions answered", totalQuestions], ["Opted into emails", optedIn]] as const;
  const cell: React.CSSProperties = { padding: "10px 12px", borderTop: "1px solid rgba(127,127,127,.25)", fontSize: 14, whiteSpace: "nowrap" };

  return <main className="policyPage"><article className="policyCard" style={{ maxWidth: 1240 }}>
    <p className="policyEyebrow">Aced admin</p>
    <h1>Students</h1>
    <p style={{ marginTop: 0, color: "#6b7280" }}>Everyone who has signed in, newest first. Times are Pacific. Homepage email-list signups are on /admin/signups.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, margin: "18px 0 26px" }}>
      {tiles.map(([label, value]) => <div key={label} style={{ border: "1px solid rgba(127,127,127,.28)", borderRadius: 16, padding: "14px 16px", background: "rgba(127,127,127,.08)", color: "inherit" }}><div style={{ fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", opacity: .7, fontWeight: 700 }}>{label}</div><div style={{ fontSize: 30, fontWeight: 700, marginTop: 4, color: "inherit" }}>{value}</div></div>)}
    </div>
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{["Name", "Email", "Grade", "Test date", "Joined", "Setup", "Emails", "Last practice", "Drills", "Tests", "Questions", "Time"].map((h) => <th key={h} style={{ ...cell, borderTop: 0, textAlign: "left", fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", color: "#6b7280" }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={`${r.email}-${i}`}>
          <td style={cell}>{r.name ?? "—"}</td>
          <td style={cell}>{r.email ?? "—"}</td>
          <td style={cell}>{r.grade_level ?? "—"}</td>
          <td style={cell}>{r.act_test_date ?? "—"}</td>
          <td style={cell}>{when(r.created_at)}</td>
          <td style={cell}>{r.finished_setup ? "✓" : "—"}</td>
          <td style={cell}>{r.email_opt_in ? "✓ yes" : "—"}</td>
          <td style={{ ...cell, opacity: r.last_active ? 1 : .5 }}>{ago(r.last_active, now)}</td>
          <td style={cell}>{r.drills}</td>
          <td style={cell}>{r.tests}</td>
          <td style={cell}>{r.questions}</td>
          <td style={cell}>{minutes(Number(r.seconds))}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </article></main>;
}
