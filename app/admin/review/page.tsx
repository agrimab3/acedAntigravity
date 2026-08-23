import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin";
import ReviewConsole from "./review-console";

export default async function AdminReviewPage() {
  const session = await getAdminSession();

  if (!session) {
    redirect("/");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg,#09111f 0%,#060d1e 55%,#03050a 100%)",
        color: "#fff",
        padding: "2rem 1.25rem 3rem",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500;700&display=swap"
        rel="stylesheet"
      />
      <div style={{ maxWidth: "1260px", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            marginBottom: "1.5rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: "11px", letterSpacing: ".08em", color: "rgba(255,255,255,0.45)" }}>
              ACED CONTENT OPS
            </div>
            <h1
              style={{
                margin: "0.35rem 0 0",
                fontFamily: "DM Serif Display, serif",
                fontSize: "34px",
                fontWeight: 400,
              }}
            >
              review and backlog console
            </h1>
            <p style={{ margin: "0.5rem 0 0", color: "rgba(255,255,255,0.55)", fontSize: "14px" }}>
              signed in as {session.user?.email}
            </p>
          </div>

          <Link
            href="/admin/question-health"
            style={{
              padding: "10px 14px",
              borderRadius: "999px",
              border: "1px solid rgba(255,255,255,0.14)",
              color: "rgba(255,255,255,0.8)",
              textDecoration: "none",
              fontSize: "13px",
            }}
          >
            question health
          </Link>

          <Link
            href="/dashboard"
            style={{
              padding: "10px 14px",
              borderRadius: "999px",
              border: "1px solid rgba(255,255,255,0.14)",
              color: "rgba(255,255,255,0.8)",
              textDecoration: "none",
              fontSize: "13px",
            }}
          >
            back to dashboard
          </Link>
        </div>

        <ReviewConsole />
      </div>
    </div>
  );
}
