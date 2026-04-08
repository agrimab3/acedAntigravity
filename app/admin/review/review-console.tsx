"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

type BacklogTopic = {
  sectionKey: string;
  topicSlug: string;
  topicName: string;
  draftCount: number;
  publishedCount: number;
  rejectedCount: number;
  targetCount: number;
};

type ReviewQuestion = {
  id: string;
  sectionKey: string;
  topicName: string;
  topicSlug: string;
  difficulty: string;
  prompt: string;
  passage: string | null;
  choices: Record<"A" | "B" | "C" | "D", string>;
  correctAnswer: string;
  explanation: string;
  source: string;
  generationModel: string | null;
  status: string;
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

const sectionOptions = ["all", "english", "math", "reading", "science"] as const;
const statusOptions = ["draft", "published", "rejected"] as const;

export default function ReviewConsole() {
  const [backlog, setBacklog] = useState<BacklogTopic[]>([]);
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [activeSection, setActiveSection] = useState<(typeof sectionOptions)[number]>("all");
  const [activeStatus, setActiveStatus] = useState<(typeof statusOptions)[number]>("draft");
  const [activeTopic, setActiveTopic] = useState("all");
  const [loadingBacklog, setLoadingBacklog] = useState(true);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [runningTopic, setRunningTopic] = useState<string | null>(null);
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [notesByQuestionId, setNotesByQuestionId] = useState<Record<string, string>>({});
  const [flashMessage, setFlashMessage] = useState<string | null>(null);

  const availableTopics = useMemo(() => {
    return backlog.filter((topic) => activeSection === "all" || topic.sectionKey === activeSection);
  }, [activeSection, backlog]);

  async function loadBacklog() {
    setLoadingBacklog(true);
    try {
      const res = await fetch("/api/admin/backlog", { cache: "no-store" });
      const data = await res.json();
      setBacklog(data.topics ?? []);
    } finally {
      setLoadingBacklog(false);
    }
  }

  async function loadQuestions() {
    setLoadingQuestions(true);

    try {
      const params = new URLSearchParams({
        status: activeStatus,
        limit: "16",
      });

      if (activeSection !== "all") {
        params.set("section", activeSection);
      }

      if (activeTopic !== "all") {
        params.set("topic", activeTopic);
      }

      const res = await fetch(`/api/admin/questions?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      const nextQuestions = (data.questions ?? []) as ReviewQuestion[];
      setQuestions(nextQuestions);
      setNotesByQuestionId(
        Object.fromEntries(nextQuestions.map((question) => [question.id, question.reviewNotes ?? ""]))
      );
    } finally {
      setLoadingQuestions(false);
    }
  }

  useEffect(() => {
    void loadBacklog();
  }, []);

  useEffect(() => {
    void loadQuestions();
  }, [activeSection, activeStatus, activeTopic]);

  async function generateDraftBatch(topic: BacklogTopic) {
    setRunningTopic(topic.topicSlug);
    setFlashMessage(null);

    try {
      const res = await fetch("/api/admin/backlog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionKey: topic.sectionKey,
          topicSlug: topic.topicSlug,
          perDifficulty: 1,
          status: "draft",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Generation failed.");
      }

      setFlashMessage(
        `Generated ${data.summary?.inserted ?? 0} draft question(s) for ${topic.topicName}.`
      );
      await Promise.all([loadBacklog(), loadQuestions()]);
    } catch (error) {
      setFlashMessage(error instanceof Error ? error.message : "Generation failed.");
    } finally {
      setRunningTopic(null);
    }
  }

  async function reviewQuestion(questionId: string, status: (typeof statusOptions)[number]) {
    setSavingQuestionId(questionId);
    setFlashMessage(null);

    try {
      const res = await fetch("/api/admin/questions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId,
          status,
          reviewNotes: notesByQuestionId[questionId] ?? "",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Review update failed.");
      }

      setFlashMessage(`Question moved to ${status}.`);
      await Promise.all([loadBacklog(), loadQuestions()]);
    } catch (error) {
      setFlashMessage(error instanceof Error ? error.message : "Review update failed.");
    } finally {
      setSavingQuestionId(null);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "380px minmax(0,1fr)", gap: "18px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
        <section
          style={{
            borderRadius: "18px",
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.03)",
            padding: "18px",
          }}
        >
          <div style={{ fontSize: "12px", letterSpacing: ".06em", color: "rgba(255,255,255,0.42)" }}>
            REVIEW FILTERS
          </div>
          <div style={{ marginTop: "14px", display: "grid", gap: "10px" }}>
            <select
              value={activeSection}
              onChange={(event) => {
                setActiveSection(event.target.value as (typeof sectionOptions)[number]);
                setActiveTopic("all");
              }}
              style={selectStyle}
            >
              {sectionOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <select
              value={activeStatus}
              onChange={(event) => setActiveStatus(event.target.value as (typeof statusOptions)[number])}
              style={selectStyle}
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <select value={activeTopic} onChange={(event) => setActiveTopic(event.target.value)} style={selectStyle}>
              <option value="all">all topics</option>
              {availableTopics.map((topic) => (
                <option key={`${topic.sectionKey}:${topic.topicSlug}`} value={topic.topicSlug}>
                  {topic.topicName}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section
          style={{
            borderRadius: "18px",
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.03)",
            padding: "18px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.75rem",
              marginBottom: "12px",
            }}
          >
            <div>
              <div style={{ fontSize: "12px", letterSpacing: ".06em", color: "rgba(255,255,255,0.42)" }}>
                BACKLOG
              </div>
              <div style={{ marginTop: "4px", color: "rgba(255,255,255,0.66)", fontSize: "13px" }}>
                controlled draft generation by topic
              </div>
            </div>
            <button onClick={() => void loadBacklog()} style={ghostButtonStyle}>
              refresh
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "70vh", overflowY: "auto" }}>
            {loadingBacklog ? (
              <div style={mutedTextStyle}>loading backlog…</div>
            ) : (
              backlog
                .filter((topic) => activeSection === "all" || topic.sectionKey === activeSection)
                .map((topic) => {
                  const needsWork = topic.publishedCount < topic.targetCount;
                  return (
                    <div
                      key={`${topic.sectionKey}:${topic.topicSlug}`}
                      style={{
                        borderRadius: "14px",
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        padding: "12px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
                        <div>
                          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>
                            {topic.sectionKey}
                          </div>
                          <div style={{ marginTop: "4px", fontWeight: 600 }}>{topic.topicName}</div>
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            alignSelf: "flex-start",
                            padding: "4px 8px",
                            borderRadius: "999px",
                            background: needsWork ? "rgba(240,153,123,0.14)" : "rgba(93,202,165,0.14)",
                            color: needsWork ? "#F0997B" : "#5DCAA5",
                          }}
                        >
                          {needsWork ? "needs more content" : "healthy"}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(3,1fr)",
                          gap: "8px",
                          marginTop: "10px",
                        }}
                      >
                        <Metric label="published" value={topic.publishedCount} />
                        <Metric label="draft" value={topic.draftCount} />
                        <Metric label="rejected" value={topic.rejectedCount} />
                      </div>

                      <button
                        onClick={() => void generateDraftBatch(topic)}
                        disabled={runningTopic === topic.topicSlug}
                        style={{
                          marginTop: "12px",
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "12px",
                          border: "none",
                          background: "#1D9E75",
                          color: "#fff",
                          cursor: runningTopic === topic.topicSlug ? "progress" : "pointer",
                          opacity: runningTopic === topic.topicSlug ? 0.7 : 1,
                          fontSize: "13px",
                        }}
                      >
                        {runningTopic === topic.topicSlug ? "generating draft batch…" : "generate 3 new draft questions"}
                      </button>
                    </div>
                  );
                })
            )}
          </div>
        </section>
      </div>

      <section
        style={{
          borderRadius: "18px",
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.03)",
          padding: "18px",
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            marginBottom: "14px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: "12px", letterSpacing: ".06em", color: "rgba(255,255,255,0.42)" }}>
              REVIEW QUEUE
            </div>
            <div style={{ marginTop: "4px", color: "rgba(255,255,255,0.66)", fontSize: "13px" }}>
              inspect draft content before broad rollout
            </div>
          </div>
          <button onClick={() => void loadQuestions()} style={ghostButtonStyle}>
            refresh
          </button>
        </div>

        {flashMessage && (
          <div
            style={{
              marginBottom: "14px",
              padding: "11px 13px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.82)",
              fontSize: "13px",
            }}
          >
            {flashMessage}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {loadingQuestions ? (
            <div style={mutedTextStyle}>loading questions…</div>
          ) : questions.length === 0 ? (
            <div style={mutedTextStyle}>no questions match the current filters.</div>
          ) : (
            questions.map((question) => (
              <article
                key={question.id}
                style={{
                  borderRadius: "16px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.03)",
                  padding: "16px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                    marginBottom: "10px",
                  }}
                >
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <Badge text={`${question.sectionKey} · ${question.topicName}`} />
                    <Badge text={question.difficulty} />
                    <Badge text={question.status} subtle />
                    {question.generationModel ? <Badge text={question.generationModel} subtle /> : null}
                  </div>
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.34)" }}>
                    {new Date(question.createdAt).toLocaleString()}
                  </div>
                </div>

                {question.passage ? (
                  <div style={passageStyle}>
                    <div style={{ fontSize: "10px", letterSpacing: ".06em", color: "rgba(255,255,255,0.38)", marginBottom: "7px" }}>
                      PASSAGE / SETUP
                    </div>
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: "13px", color: "rgba(255,255,255,0.78)" }}>
                      {question.passage}
                    </div>
                  </div>
                ) : null}

                <div
                  style={{
                    fontFamily: "DM Serif Display, serif",
                    fontSize: "20px",
                    lineHeight: 1.45,
                    marginBottom: "12px",
                  }}
                >
                  {question.prompt}
                </div>

                <div style={{ display: "grid", gap: "8px", marginBottom: "12px" }}>
                  {(["A", "B", "C", "D"] as const).map((choice) => (
                    <div
                      key={choice}
                      style={{
                        borderRadius: "12px",
                        padding: "10px 12px",
                        border: `1px solid ${question.correctAnswer === choice ? "rgba(93,202,165,0.4)" : "rgba(255,255,255,0.08)"}`,
                        background:
                          question.correctAnswer === choice
                            ? "rgba(93,202,165,0.09)"
                            : "rgba(255,255,255,0.02)",
                        fontSize: "13px",
                        color: "rgba(255,255,255,0.82)",
                      }}
                    >
                      <strong style={{ marginRight: "8px" }}>{choice}</strong>
                      {question.choices[choice]}
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    borderRadius: "12px",
                    padding: "12px 13px",
                    background: "rgba(255,255,255,0.04)",
                    color: "rgba(255,255,255,0.72)",
                    fontSize: "13px",
                    lineHeight: 1.65,
                    marginBottom: "12px",
                  }}
                >
                  <strong style={{ color: "#5DCAA5" }}>Explanation:</strong> {question.explanation}
                </div>

                <textarea
                  value={notesByQuestionId[question.id] ?? ""}
                  onChange={(event) =>
                    setNotesByQuestionId((current) => ({
                      ...current,
                      [question.id]: event.target.value,
                    }))
                  }
                  placeholder="review notes, accuracy concerns, or why this should be rejected…"
                  style={{
                    width: "100%",
                    minHeight: "92px",
                    borderRadius: "12px",
                    padding: "12px 13px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.09)",
                    color: "#fff",
                    resize: "vertical",
                    fontSize: "13px",
                    outline: "none",
                    marginBottom: "12px",
                    fontFamily: "DM Sans, sans-serif",
                  }}
                />

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    onClick={() => void reviewQuestion(question.id, "published")}
                    disabled={savingQuestionId === question.id}
                    style={primaryButtonStyle}
                  >
                    publish
                  </button>
                  <button
                    onClick={() => void reviewQuestion(question.id, "rejected")}
                    disabled={savingQuestionId === question.id}
                    style={secondaryButtonStyle}
                  >
                    reject
                  </button>
                  <button
                    onClick={() => void reviewQuestion(question.id, "draft")}
                    disabled={savingQuestionId === question.id}
                    style={ghostButtonStyle}
                  >
                    keep as draft
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        borderRadius: "12px",
        background: "rgba(255,255,255,0.04)",
        padding: "10px",
      }}
    >
      <div style={{ fontSize: "20px", fontFamily: "DM Serif Display, serif" }}>{value}</div>
      <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.38)" }}>{label}</div>
    </div>
  );
}

function Badge({ text, subtle = false }: { text: string; subtle?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "999px",
        padding: "4px 9px",
        fontSize: "11px",
        background: subtle ? "rgba(255,255,255,0.06)" : "rgba(93,202,165,0.14)",
        color: subtle ? "rgba(255,255,255,0.62)" : "#5DCAA5",
      }}
    >
      {text}
    </span>
  );
}

const selectStyle: CSSProperties = {
  width: "100%",
  borderRadius: "12px",
  padding: "11px 12px",
  background: "rgba(255,255,255,0.04)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.1)",
  fontSize: "13px",
};

const ghostButtonStyle: CSSProperties = {
  padding: "9px 12px",
  borderRadius: "12px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "rgba(255,255,255,0.82)",
  fontSize: "13px",
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  padding: "10px 13px",
  borderRadius: "12px",
  background: "#1D9E75",
  border: "none",
  color: "#fff",
  fontSize: "13px",
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  padding: "10px 13px",
  borderRadius: "12px",
  background: "rgba(240,153,123,0.14)",
  border: "1px solid rgba(240,153,123,0.24)",
  color: "#F0997B",
  fontSize: "13px",
  cursor: "pointer",
};

const mutedTextStyle: CSSProperties = {
  color: "rgba(255,255,255,0.48)",
  fontSize: "13px",
};

const passageStyle: CSSProperties = {
  borderRadius: "14px",
  padding: "13px 14px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  marginBottom: "12px",
};
