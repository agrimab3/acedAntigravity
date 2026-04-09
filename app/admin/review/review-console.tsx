"use client";

import type { CSSProperties } from "react";
import { Fragment, useEffect, useEffectEvent, useMemo, useState } from "react";

type BacklogTopic = {
  sectionKey: string;
  topicSlug: string;
  topicName: string;
  draftCount: number;
  rawPublishedCount: number;
  rejectedCount: number;
  targetCount: number;
  targetPerDifficulty: number;
  serveablePublishedCount: number;
  serveableDraftCount: number;
  blockedPublishedCount: number;
  blockedDraftCount: number;
  warningPublishedCount: number;
  warningDraftCount: number;
  publishedGapCount: number;
  needsWork: boolean;
  reviewPriority: "critical" | "rebuild" | "watch" | "healthy";
  focusDifficulty: "easy" | "medium" | "hard" | "balanced";
  recommendedPerDifficulty: number;
  priorityScore: number;
  difficultyBreakdown: Array<{
    difficulty: "easy" | "medium" | "hard";
    publishedCount: number;
    serveablePublishedCount: number;
    blockedPublishedCount: number;
    warningPublishedCount: number;
    draftCount: number;
    serveableDraftCount: number;
    blockedDraftCount: number;
    warningDraftCount: number;
    publishedGapCount: number;
  }>;
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
  qualityReview: {
    shouldServe: boolean;
    riskScore: number;
    blockingFlags: Array<{
      severity: "reject" | "warn";
      code: string;
      message: string;
    }>;
    warningFlags: Array<{
      severity: "reject" | "warn";
      code: string;
      message: string;
    }>;
  };
};

const sectionOptions = ["all", "english", "math", "reading", "science"] as const;
const statusOptions = ["draft", "published", "rejected"] as const;

function getBacklogPriorityBadge(topic: BacklogTopic) {
  if (topic.reviewPriority === "critical") {
    return {
      label: "critical rebuild",
      tone: "danger" as const,
    };
  }

  if (topic.reviewPriority === "rebuild") {
    return {
      label: "rebuild next",
      tone: "warning" as const,
    };
  }

  if (topic.reviewPriority === "watch") {
    return {
      label: "watch warnings",
      tone: "warning" as const,
    };
  }

  return {
    label: "healthy live pool",
    tone: "success" as const,
  };
}

function formatFocusDifficulty(topic: BacklogTopic) {
  return topic.focusDifficulty === "balanced" ? "balanced mix" : `${topic.focusDifficulty} gap`;
}

function renderFormattedText(text: string) {
  const normalized = text
    .replace(/<u>(.*?)<\/u>/gi, "[underline]$1[/underline]")
    .replace(/__(.*?)__/g, "[underline]$1[/underline]");
  const lines = normalized.split("\n");

  return lines.map((line, lineIndex) => {
    const segments = line.split(/(\[underline\].*?\[\/underline\])/g);

    return (
      <Fragment key={`${line}-${lineIndex}`}>
        {segments.map((segment, segmentIndex) => {
          const match = segment.match(/^\[underline\](.*?)\[\/underline\]$/);
          if (match) {
            return <u key={`${segment}-${segmentIndex}`}>{match[1]}</u>;
          }

          return <Fragment key={`${segment}-${segmentIndex}`}>{segment}</Fragment>;
        })}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </Fragment>
    );
  });
}

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

  const prioritizedBacklog = useMemo(() => {
    return [...availableTopics].sort((left, right) => {
      if (left.needsWork !== right.needsWork) {
        return left.needsWork ? -1 : 1;
      }

      if (left.priorityScore !== right.priorityScore) {
        return right.priorityScore - left.priorityScore;
      }

      return left.topicName.localeCompare(right.topicName);
    });
  }, [availableTopics]);

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

  const handleLoadQuestions = useEffectEvent(() => {
    void loadQuestions();
  });

  useEffect(() => {
    handleLoadQuestions();
  }, [activeSection, activeStatus, activeTopic]);

  async function generateDraftBatch(topic: BacklogTopic) {
    setRunningTopic(topic.topicSlug);
    setFlashMessage(null);

    const batchSize = topic.recommendedPerDifficulty * 3;

    try {
      const res = await fetch("/api/admin/backlog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionKey: topic.sectionKey,
          topicSlug: topic.topicSlug,
          perDifficulty: topic.recommendedPerDifficulty,
          status: "draft",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Generation failed.");
      }

      setFlashMessage(
        `Generated ${data.summary?.inserted ?? 0} of ${batchSize} requested draft question(s) for ${topic.topicName}.`
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
                prioritize true serveable inventory gaps by topic
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
              prioritizedBacklog.map((topic) => {
                  const priorityBadge = getBacklogPriorityBadge(topic);
                  const batchSize = topic.recommendedPerDifficulty * 3;
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
                          <div style={{ marginTop: "6px", fontSize: "12px", color: "rgba(255,255,255,0.54)", lineHeight: 1.5 }}>
                            live pool {topic.serveablePublishedCount}/{topic.targetCount}
                            {topic.publishedGapCount > 0 ? ` · gap ${topic.publishedGapCount}` : " · target met"}
                            {" · "}
                            focus {formatFocusDifficulty(topic)}
                          </div>
                        </div>
                        <Badge text={priorityBadge.label} tone={priorityBadge.tone} />
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2,minmax(0,1fr))",
                          gap: "8px",
                          marginTop: "10px",
                        }}
                      >
                        <Metric label="serveable live" value={topic.serveablePublishedCount} />
                        <Metric label="blocked live" value={topic.blockedPublishedCount} />
                        <Metric label="serveable drafts" value={topic.serveableDraftCount} />
                        <Metric label="rejected" value={topic.rejectedCount} />
                      </div>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", marginTop: "12px" }}>
                        {topic.difficultyBreakdown.map((difficulty) => (
                          <Badge
                            key={`${topic.topicSlug}-${difficulty.difficulty}`}
                            text={`${difficulty.difficulty} ${difficulty.serveablePublishedCount}/${topic.targetPerDifficulty}`}
                            tone={difficulty.publishedGapCount > 0 ? "warning" : "success"}
                          />
                        ))}
                        {topic.warningPublishedCount > 0 ? (
                          <Badge text={`${topic.warningPublishedCount} live warning${topic.warningPublishedCount === 1 ? "" : "s"}`} tone="warning" />
                        ) : null}
                        {topic.blockedDraftCount > 0 ? (
                          <Badge text={`${topic.blockedDraftCount} blocked draft${topic.blockedDraftCount === 1 ? "" : "s"}`} tone="danger" />
                        ) : null}
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
                        {runningTopic === topic.topicSlug
                          ? "generating draft batch…"
                          : `generate ${batchSize} draft question${batchSize === 1 ? "" : "s"}`}
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
                    <Badge
                      text={
                        question.qualityReview.blockingFlags.length > 0
                          ? "serve blocked"
                          : question.qualityReview.warningFlags.length > 0
                            ? `risk ${question.qualityReview.riskScore}`
                            : "clean read"
                      }
                      tone={
                        question.qualityReview.blockingFlags.length > 0
                          ? "danger"
                          : question.qualityReview.warningFlags.length > 0
                            ? "warning"
                            : "success"
                      }
                    />
                    {question.generationModel ? <Badge text={question.generationModel} subtle /> : null}
                  </div>
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.34)" }}>
                    {new Date(question.createdAt).toLocaleString()}
                  </div>
                </div>

                {(question.qualityReview.blockingFlags.length > 0 ||
                  question.qualityReview.warningFlags.length > 0) && (
                  <div
                    style={{
                      borderRadius: "12px",
                      padding: "12px 13px",
                      background:
                        question.qualityReview.blockingFlags.length > 0
                          ? "rgba(240,153,123,0.11)"
                          : "rgba(239,159,39,0.1)",
                      border:
                        question.qualityReview.blockingFlags.length > 0
                          ? "1px solid rgba(240,153,123,0.22)"
                          : "1px solid rgba(239,159,39,0.2)",
                      marginBottom: "12px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "11px",
                        letterSpacing: ".06em",
                        color:
                          question.qualityReview.blockingFlags.length > 0
                            ? "#F0997B"
                            : "#EF9F27",
                        marginBottom: "8px",
                      }}
                    >
                      QUALITY READ
                    </div>
                    <div style={{ display: "grid", gap: "8px" }}>
                      {question.qualityReview.blockingFlags.map((flag) => (
                        <div key={`${question.id}-${flag.code}`} style={{ fontSize: "12px", lineHeight: 1.6, color: "rgba(255,255,255,0.82)" }}>
                          <strong style={{ color: "#F0997B" }}>block:</strong> {flag.message}
                        </div>
                      ))}
                      {question.qualityReview.warningFlags.map((flag) => (
                        <div key={`${question.id}-${flag.code}`} style={{ fontSize: "12px", lineHeight: 1.6, color: "rgba(255,255,255,0.76)" }}>
                          <strong style={{ color: "#EF9F27" }}>watch:</strong> {flag.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {question.passage ? (
                  <div style={passageStyle}>
                    <div style={{ fontSize: "10px", letterSpacing: ".06em", color: "rgba(255,255,255,0.38)", marginBottom: "7px" }}>
                      PASSAGE / SETUP
                    </div>
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: "13px", color: "rgba(255,255,255,0.78)" }}>
                      {renderFormattedText(question.passage)}
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
                  {renderFormattedText(question.prompt)}
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
                      {renderFormattedText(question.choices[choice])}
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

function Badge({
  text,
  subtle = false,
  tone = "default",
}: {
  text: string;
  subtle?: boolean;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const palette = subtle
    ? {
        background: "rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.62)",
      }
    : tone === "danger"
      ? {
          background: "rgba(240,153,123,0.14)",
          color: "#F0997B",
        }
      : tone === "warning"
        ? {
            background: "rgba(239,159,39,0.14)",
            color: "#EF9F27",
          }
        : tone === "success"
          ? {
              background: "rgba(93,202,165,0.14)",
              color: "#5DCAA5",
            }
          : {
              background: "rgba(93,202,165,0.14)",
              color: "#5DCAA5",
            };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "999px",
        padding: "4px 9px",
        fontSize: "11px",
        background: palette.background,
        color: palette.color,
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
