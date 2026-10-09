"use client";

import { useEffect, useState } from "react";

type FormRow = {
  id: string;
  version: string;
  status: "draft" | "review" | "locked";
  slug: string;
  testDate: string;
  reviewedAt: string | null;
  lockedAt: string | null;
  createdAt: string;
};

type Audit = {
  form: FormRow;
  pass: boolean;
  totalQuestions: number;
  checks: Array<{ code: string; pass: boolean; message: string }>;
  sectionSummaries: Array<{
    sectionKey: string;
    count: number;
    expected: number;
    difficulty: Record<string, number>;
    topics: Record<string, number>;
    setCount: number;
  }>;
  questions: Array<{
    id: string;
    sectionKey: string;
    position: number;
    topicName: string;
    difficulty: string;
    questionSetId: string | null;
    prompt: string;
    qualityClean: boolean;
    exposureCount: number;
  }>;
};

const card = {
  border: "1px solid rgba(255,255,255,.09)",
  background: "rgba(255,255,255,.035)",
  borderRadius: 16,
  padding: 16,
};

export default function FormConsole() {
  const [forms, setForms] = useState<FormRow[]>([]);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadForms() {
    const res = await fetch("/api/admin/mock-test-forms", { cache: "no-store" });
    const data = await res.json();
    setForms(data.forms ?? []);
    const nextId = selectedId ?? data.forms?.[0]?.id ?? null;
    if (nextId) {
      setSelectedId(nextId);
      await loadAudit(nextId);
    } else {
      setAudit(null);
    }
  }

  async function loadAudit(formId: string) {
    const res = await fetch(`/api/admin/mock-test-forms?formId=${formId}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load form audit.");
    setAudit(data.audit);
  }

  useEffect(() => {
    void loadForms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(action: "mark-review" | "lock") {
    if (!audit) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/mock-test-forms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formId: audit.form.id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Form action failed.");
      setAudit(data.audit);
      setMessage(action === "lock" ? "Form locked. Assignments are now immutable." : "Form moved to review.");
      await loadForms();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Form action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px minmax(0,1fr)", gap: 18 }}>
      <aside style={card}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,.48)", marginBottom: 10 }}>FORMS</div>
        {forms.length === 0 ? (
          <div style={{ color: "rgba(255,255,255,.5)", fontSize: 13 }}>No forms yet. The assembler will create Form A once approved reserve inventory is sufficient.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {forms.map((form) => (
              <button
                key={form.id}
                onClick={() => {
                  setSelectedId(form.id);
                  void loadAudit(form.id);
                }}
                style={{
                  textAlign: "left",
                  padding: "11px 12px",
                  borderRadius: 12,
                  border: selectedId === form.id ? "1px solid rgba(93,202,165,.5)" : "1px solid rgba(255,255,255,.08)",
                  background: selectedId === form.id ? "rgba(93,202,165,.08)" : "rgba(255,255,255,.02)",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 700 }}>Form {form.version}</div>
                <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,.5)" }}>{form.slug} · {form.status}</div>
              </button>
            ))}
          </div>
        )}
      </aside>

      <section style={{ display: "grid", gap: 16 }}>
        {!audit ? (
          <div style={card}>No form selected.</div>
        ) : (
          <>
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,.45)" }}>{audit.form.slug}</div>
                  <h2 style={{ margin: "4px 0" }}>Form {audit.form.version} · {audit.form.status}</h2>
                  <div style={{ color: audit.pass ? "#8ee3c4" : "#efb267", fontSize: 13 }}>
                    {audit.pass ? "audit passes" : "audit has failed checks"} · {audit.totalQuestions}/171
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {audit.form.status === "draft" ? (
                    <button disabled={busy || !audit.pass} onClick={() => void act("mark-review")} style={{ padding: "10px 14px", borderRadius: 10 }}>
                      move to review
                    </button>
                  ) : null}
                  {audit.form.status === "review" ? (
                    <button disabled={busy || !audit.pass} onClick={() => void act("lock")} style={{ padding: "10px 14px", borderRadius: 10 }}>
                      lock form
                    </button>
                  ) : null}
                </div>
              </div>
              {message ? <div style={{ marginTop: 12, fontSize: 13, color: "#efc27a" }}>{message}</div> : null}
            </div>

            <div style={{ ...card, display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.45)" }}>AUDIT CHECKS</div>
              {audit.checks.map((check) => (
                <div key={check.code} style={{ display: "flex", gap: 10, fontSize: 13 }}>
                  <span style={{ color: check.pass ? "#5DCAA5" : "#EF9F27" }}>{check.pass ? "✓" : "✕"}</span>
                  <span>{check.message}</span>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10 }}>
              {audit.sectionSummaries.map((section) => (
                <div key={section.sectionKey} style={card}>
                  <div style={{ textTransform: "uppercase", fontSize: 11, color: "rgba(255,255,255,.4)" }}>{section.sectionKey}</div>
                  <div style={{ fontSize: 24, margin: "5px 0" }}>{section.count}/{section.expected}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,.56)" }}>
                    e {section.difficulty.easy ?? 0} · m {section.difficulty.medium ?? 0} · h {section.difficulty.hard ?? 0}
                    {section.setCount > 0 ? ` · ${section.setCount} sets` : ""}
                  </div>
                </div>
              ))}
            </div>

            <div style={card}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.45)", marginBottom: 10 }}>QUESTION ORDER</div>
              <div style={{ maxHeight: 520, overflow: "auto", display: "grid", gap: 6 }}>
                {audit.questions.map((question) => (
                  <div key={question.id} style={{ display: "grid", gridTemplateColumns: "70px 140px 80px minmax(0,1fr)", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,.05)", fontSize: 12 }}>
                    <span>{question.sectionKey} {question.position}</span>
                    <span>{question.topicName}</span>
                    <span>{question.difficulty}</span>
                    <span style={{ color: "rgba(255,255,255,.72)" }}>{question.prompt}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
