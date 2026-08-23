import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin";
import { getAdminQuestionHealthReport } from "@/lib/admin-question-health";

export const dynamic = "force-dynamic";

function formatCount(value: number) {
  return value.toLocaleString();
}

function formatMultiple(value: number) {
  return `${value.toFixed(2)}x`;
}

export default async function AdminQuestionHealthPage() {
  const session = await getAdminSession();

  if (!session) {
    redirect("/");
  }

  const report = await getAdminQuestionHealthReport();

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
      <div style={{ maxWidth: "1320px", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            marginBottom: "1.75rem",
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
              question inventory audit
            </h1>
            <p style={{ margin: "0.5rem 0 0", color: "rgba(255,255,255,0.55)", fontSize: "14px" }}>
              signed in as {session.user?.email}
            </p>
            <p style={{ margin: "0.35rem 0 0", color: "rgba(255,255,255,0.4)", fontSize: "12px" }}>
              generated {new Date(report.metadata.generatedAt).toLocaleString()}
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Link
              href="/admin/review"
              style={{
                padding: "10px 14px",
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,0.14)",
                color: "rgba(255,255,255,0.8)",
                textDecoration: "none",
                fontSize: "13px",
              }}
            >
              review console
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
        </div>

        <SectionCard title="Section Inventory">
          <Table
            headers={[
              "Section",
              "Topics",
              "Total",
              "Published",
              "Serveable",
              "Blocked Published",
              "Non-published",
              "Malformed",
              "Demand",
              "Multiple",
              "Health",
            ]}
            rows={report.sectionInventory.map((item) => [
              item.sectionKey,
              formatCount(item.topicCount),
              formatCount(item.totalRows),
              formatCount(item.publishedRows),
              formatCount(item.serveableRows),
              formatCount(item.blockedPublishedRows),
              formatCount(item.nonPublishedRows),
              formatCount(item.malformedRows),
              formatCount(item.fullTestDemand),
              formatMultiple(item.inventoryMultiple),
              item.health,
            ])}
          />
        </SectionCard>

        <SectionCard title="Topic x Difficulty">
          <Table
            headers={[
              "Section",
              "Topic",
              "Easy",
              "Easy Health",
              "Medium",
              "Medium Health",
              "Hard",
              "Hard Health",
              "Total Serveable",
              "Other Diff",
            ]}
            rows={report.topicDifficultyInventory.map((item) => [
              item.sectionKey,
              item.topicName,
              formatCount(item.easy.count),
              item.easy.health,
              formatCount(item.medium.count),
              item.medium.health,
              formatCount(item.hard.count),
              item.hard.health,
              formatCount(item.totalServeable),
              formatCount(item.otherDifficultyCount),
            ])}
          />
        </SectionCard>

        <SectionCard title="Reading / Science Passage Health">
          <Table
            headers={[
              "Section",
              "Serveable Questions",
              "Approx Unique Passages",
              "Avg Questions / Passage",
            ]}
            rows={report.passageHealth.map((item) => [
              item.sectionKey,
              formatCount(item.serveableQuestionCount),
              formatCount(item.approximateUniquePassages),
              item.averageQuestionsPerPassage.toFixed(2),
            ])}
          />
        </SectionCard>

        <SectionCard title="Integrity Issues">
          <div style={{ color: "rgba(255,255,255,0.72)", fontSize: "14px", marginBottom: "1rem" }}>
            mismatch total: {formatCount(report.integrityIssues.mismatchTotal)}
          </div>
          <Table
            headers={["Question Section", "Topic Section", "Count", "Sample IDs"]}
            rows={report.integrityIssues.mismatchGroups.map((item) => [
              item.questionSectionKey,
              item.topicSectionKey,
              formatCount(item.count),
              item.questionIds.join(", "),
            ])}
          />
        </SectionCard>

        <SectionCard title="Duplicate Risk">
          <div style={{ display: "grid", gap: "1.25rem" }}>
            <div>
              <h3 style={{ margin: "0 0 0.75rem", fontSize: "18px", fontWeight: 600 }}>
                fingerprint duplicates
              </h3>
              <p style={{ margin: "0 0 0.75rem", color: "rgba(255,255,255,0.62)", fontSize: "13px" }}>
                {formatCount(report.duplicateRisk.fingerprint.duplicateGroupCount)} groups ·{" "}
                {formatCount(report.duplicateRisk.fingerprint.affectedQuestionCount)} affected questions
              </p>
              <Table
                headers={["Section", "Affected Questions"]}
                rows={report.duplicateRisk.fingerprint.sections.map((item) => [
                  item.sectionKey,
                  formatCount(item.affectedQuestionCount),
                ])}
              />
            </div>

            <div>
              <h3 style={{ margin: "0 0 0.75rem", fontSize: "18px", fontWeight: 600 }}>
                normalized stem duplicates
              </h3>
              <p style={{ margin: "0 0 0.75rem", color: "rgba(255,255,255,0.62)", fontSize: "13px" }}>
                {formatCount(report.duplicateRisk.normalizedStem.duplicateGroupCount)} groups ·{" "}
                {formatCount(report.duplicateRisk.normalizedStem.affectedQuestionCount)} affected questions
              </p>
              <Table
                headers={["Section", "Affected Questions"]}
                rows={report.duplicateRisk.normalizedStem.sections.map((item) => [
                  item.sectionKey,
                  formatCount(item.affectedQuestionCount),
                ])}
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Generated Priority Backlog">
          <p style={{ margin: "0 0 0.9rem", color: "rgba(255,255,255,0.58)", fontSize: "13px" }}>
            targets: English 250 · Math 225 · Reading 180 · Science 200
          </p>
          <Table
            headers={[
              "Section",
              "Topic",
              "Difficulty",
              "Current",
              "Target",
              "Gap",
              "Health",
              "Approx Stimulus Sets",
            ]}
            rows={report.recommendedBacklog.map((item) => [
              item.sectionKey,
              item.topicName,
              item.difficulty,
              formatCount(item.currentCount),
              formatCount(item.targetCount),
              formatCount(item.gap),
              item.health,
              formatCount(item.suggestedStimulusSets),
            ])}
          />
        </SectionCard>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        marginBottom: "1.25rem",
        borderRadius: "20px",
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(10, 16, 28, 0.78)",
        boxShadow: "0 18px 48px rgba(0,0,0,0.22)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "1rem 1.1rem",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          fontFamily: "DM Serif Display, serif",
          fontSize: "24px",
        }}
      >
        {title}
      </div>
      <div style={{ padding: "1rem 1.1rem", overflowX: "auto" }}>{children}</div>
    </section>
  );
}

function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<string>>;
}) {
  if (rows.length === 0) {
    return (
      <div style={{ color: "rgba(255,255,255,0.55)", fontSize: "14px" }}>
        no rows returned
      </div>
    );
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "760px" }}>
      <thead>
        <tr>
          {headers.map((header) => (
            <th
              key={header}
              style={{
                textAlign: "left",
                padding: "0.7rem 0.75rem",
                fontSize: "12px",
                color: "rgba(255,255,255,0.52)",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                whiteSpace: "nowrap",
              }}
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={`${row[0]}-${rowIndex}`}>
            {row.map((cell, cellIndex) => (
              <td
                key={`${cellIndex}-${cell}`}
                style={{
                  padding: "0.75rem",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  fontSize: "13px",
                  color:
                    cellIndex === 0 || cellIndex === 1
                      ? "rgba(255,255,255,0.92)"
                      : "rgba(255,255,255,0.72)",
                  verticalAlign: "top",
                }}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
