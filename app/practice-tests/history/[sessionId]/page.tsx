"use client";

import { Fragment, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useOnboardingState } from "@/lib/use-onboarding-state";

const REVIEW_GALAXY_BACKGROUND =
  "radial-gradient(circle at 18% 16%, rgba(74, 128, 178, 0.12), transparent 32%), radial-gradient(circle at 74% 24%, rgba(88, 138, 188, 0.08), transparent 34%), radial-gradient(circle at 52% 72%, rgba(120, 136, 182, 0.06), transparent 40%), linear-gradient(180deg,#0d1b2a 0%,#081221 44%,#020408 100%)";

function formatCountdown(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatHistoryTimestamp(value: string | null) {
  if (!value) {
    return "saved test";
  }

  return new Date(value).toLocaleString([], {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

export default function PracticeTestHistoryDetailPage() {
  const router = useRouter();
  const params = useParams<{ sessionId: string }>();
  const { status, data: session } = useSession();
  const { loading: onboardingLoading } = useOnboardingState(status, {
    redirectIfIncomplete: "/onboarding",
  });
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<{
    modeKey: string;
    shortLabel: string;
    title: string;
    format: string;
    status: string;
    totalQuestionCount: number;
    answeredCount: number;
    correctCount: number;
    accuracyPct: number;
    compositeEstimatedScore: number | null;
    durationSeconds: number;
    completedAt: string | null;
    overallPacing: { label: string; description: string } | null;
    sectionReports: Array<{
      id: string;
      sectionKey: string;
      title: string;
      questionCount: number;
      answeredCount: number;
      correctCount: number;
      accuracyPct: number;
      estimatedScore: number | null;
      durationSeconds: number;
      timeLimitSeconds: number;
      pacingSummary: { label: string; description: string };
    }>;
    missedAnalysis: Array<{
      sectionKey: string;
      sectionTitle: string;
      topicName: string;
      misses: number;
    }>;
    missedQuestions: Array<{
      id: string;
      sectionKey: string;
      sectionTitle: string;
      questionOrder: number;
      topicName: string;
      selectedAnswer: string | null;
      correctAnswer: string;
      flagged: boolean;
      question: {
        passage: string | null;
        question_text: string;
        explanation: string;
      };
    }>;
  } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [historyFeedback, setHistoryFeedback] = useState<{
    tone: "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [router, status]);

  useEffect(() => {
    if (status !== "authenticated" || !params.sessionId) {
      return;
    }

    let active = true;

    const loadDetail = async () => {
      setLoading(true);

      try {
        const res = await fetch(`/api/practice-tests/history/${params.sessionId}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (active) {
          setDetail(data);
        }
      } catch (error) {
        console.error("Failed to load test review", error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadDetail();

    return () => {
      active = false;
    };
  }, [params.sessionId, status]);

  useEffect(() => {
    if (!historyFeedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setHistoryFeedback(null);
    }, 2600);

    return () => window.clearTimeout(timeoutId);
  }, [historyFeedback]);

  async function handleDeleteTest() {
    if (!params.sessionId || deleting) {
      return;
    }

    setDeleting(true);

    try {
      const res = await fetch(`/api/practice-tests/history/${params.sessionId}`, {
        method: "DELETE",
      });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;

      if (!res.ok) {
        throw new Error(
          payload?.error === "Unauthorized."
            ? "sign in again to delete this test."
            : payload?.error === "Forbidden."
              ? "you can't delete this test."
              : payload?.error === "Test history not found."
                ? "this test no longer exists."
                : "couldn't delete this test. try again."
        );
      }

      router.push("/progress?historyMessage=test-deleted");
    } catch (error) {
      console.error("Failed to delete saved test from detail view", error);
      setHistoryFeedback({
        tone: "error",
        message:
          error instanceof Error ? error.message : "couldn't delete this test. try again.",
      });
    } finally {
      setDeleting(false);
    }
  }

  if (status === "loading" || onboardingLoading || loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: REVIEW_GALAXY_BACKGROUND,
          color: "rgba(255,255,255,0.46)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "DM Sans,sans-serif",
        }}
      >
        loading test review...
      </div>
    );
  }

  if (status === "unauthenticated" || !detail) {
    return null;
  }

  return (
    <div style={{ minHeight: "100vh", background: REVIEW_GALAXY_BACKGROUND, color: "#fff", fontFamily: "DM Sans,sans-serif", position: "relative" }}>
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500&display=swap"
        rel="stylesheet"
      />
      {historyFeedback ? (
        <div
          style={{
            position: "fixed",
            top: "18px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 40,
            padding: "10px 14px",
            borderRadius: "999px",
            border: "0.5px solid rgba(240,153,123,0.32)",
            background: "rgba(30, 14, 14, 0.92)",
            color: "rgba(255,230,222,0.94)",
            fontSize: "12px",
            boxShadow: "0 16px 34px rgba(0,0,0,0.28)",
          }}
        >
          {historyFeedback.message}
        </div>
      ) : null}
      <div style={{ padding: "1.5rem", maxWidth: "1240px", margin: "0 auto" }}>
        <nav
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: "1rem",
            marginBottom: "2rem",
          }}
        >
          <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "26px", justifySelf: "start" }}>
            Aced<em style={{ color: "#1D9E75" }}>.</em>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "2.2rem", justifySelf: "center" }}>
            {[
              { label: "your universe", onClick: () => router.push("/dashboard"), active: false },
              { label: "practice tests", onClick: () => router.push("/practice-tests"), active: true },
              { label: "progress", onClick: () => router.push("/progress"), active: false },
            ].map((item) => (
              <button
                key={item.label}
                onClick={item.onClick}
                style={{
                  background: "transparent",
                  border: "none",
                  color: item.active ? "#fff" : "rgba(255,255,255,0.78)",
                  fontSize: "17px",
                  fontWeight: 500,
                  cursor: item.active ? "default" : "pointer",
                  padding: "6px 4px",
                  position: "relative",
                  textShadow: item.active
                    ? "0 0 18px rgba(29,158,117,0.4)"
                    : "0 0 14px rgba(255,255,255,0.18)",
                  fontFamily: "DM Sans,sans-serif",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    width: item.active ? "calc(100% + 26px)" : "calc(100% + 22px)",
                    height: item.active ? "24px" : "20px",
                    transform: "translate(-50%, -50%)",
                    borderRadius: "999px",
                    background: item.active
                      ? "radial-gradient(circle, rgba(29,158,117,0.26) 0%, rgba(29,158,117,0.12) 54%, transparent 82%)"
                      : "radial-gradient(circle, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.045) 58%, transparent 84%)",
                    filter: item.active ? "blur(12px)" : "blur(11px)",
                    zIndex: 0,
                    pointerEvents: "none",
                  }}
                />
                <span style={{ position: "relative", zIndex: 1 }}>{item.label}</span>
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", justifySelf: "end" }}>
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.28)" }}>
              {session?.user?.email}
            </span>
            <button
              onClick={() => void signOut({ callbackUrl: "/" })}
              style={{
                padding: "7px 16px",
                borderRadius: "999px",
                border: "0.5px solid rgba(255,255,255,0.12)",
                background: "transparent",
                color: "rgba(255,255,255,0.55)",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              sign out
            </button>
          </div>
        </nav>

        <div style={{ marginBottom: "1.5rem", maxWidth: "760px" }}>
          <div style={{ fontSize: "11px", letterSpacing: ".08em", textTransform: "uppercase", color: "#5DCAA5", marginBottom: "10px" }}>
            saved review
          </div>
          <h1 style={{ fontFamily: "DM Serif Display,serif", fontSize: "clamp(2rem,4.4vw,3.4rem)", fontWeight: 400, lineHeight: 1.06, marginBottom: "10px" }}>
            {detail.title},
            <br />
            <em style={{ color: "#1D9E75" }}>review your missed questions</em>
          </h1>
          <p style={{ fontSize: "15px", lineHeight: 1.75, color: "rgba(255,255,255,0.56)" }}>
            This review is pulled from your saved timed-test history, so you can come back to misses and pacing after the report screen is gone.
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "1.2rem" }}>
          {[
            detail.shortLabel,
            formatHistoryTimestamp(detail.completedAt),
            `${formatCountdown(detail.durationSeconds)} total`,
            `${detail.answeredCount}/${detail.totalQuestionCount} answered`,
            detail.status,
          ].map((value) => (
            <span
              key={value}
              style={{
                fontSize: "11px",
                color: "rgba(255,255,255,0.72)",
                background: "rgba(255,255,255,0.06)",
                borderRadius: "999px",
                padding: "6px 9px",
              }}
            >
              {value}
            </span>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "12px", marginBottom: "1.2rem" }}>
          {[
            { value: `${detail.correctCount}/${detail.totalQuestionCount}`, label: "raw score" },
            { value: `${detail.accuracyPct}%`, label: "accuracy" },
            { value: detail.compositeEstimatedScore ? `${detail.compositeEstimatedScore}/36` : "--", label: detail.format === "full" ? "composite estimate" : "section estimate" },
            { value: `${detail.answeredCount}`, label: "answered" },
            { value: detail.overallPacing?.label ?? "on pace", label: "pace read" },
          ].map((item) => (
            <div key={item.label} style={{ borderRadius: "16px", background: "rgba(255,255,255,0.04)", padding: "1rem" }}>
              <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "30px", color: "#F4F0E8", marginBottom: "4px" }}>{item.value}</div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.34)" }}>{item.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 380px", gap: "18px", alignItems: "start" }}>
          <div style={{ display: "grid", gap: "14px" }}>
            <section style={{ borderRadius: "18px", background: "rgba(255,255,255,0.035)", border: "0.5px solid rgba(255,255,255,0.08)", padding: "1.1rem" }}>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.42)", marginBottom: "10px" }}>test summary</div>
              <div style={{ display: "grid", gap: "10px" }}>
                {[
                  { label: "test type", value: detail.title },
                  { label: "date taken", value: formatHistoryTimestamp(detail.completedAt) },
                  { label: "duration", value: formatCountdown(detail.durationSeconds) },
                  { label: "question counts", value: `${detail.correctCount} correct · ${detail.answeredCount} answered · ${detail.totalQuestionCount} total` },
                  {
                    label: "pacing summary",
                    value: detail.overallPacing
                      ? `${detail.overallPacing.label} · ${detail.overallPacing.description}`
                      : "Pacing summary unavailable for this saved test.",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      borderRadius: "14px",
                      background: "rgba(255,255,255,0.03)",
                      padding: "0.9rem 1rem",
                    }}
                  >
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.36)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: ".06em" }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.72)", lineHeight: 1.7 }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section style={{ borderRadius: "18px", background: "rgba(255,255,255,0.035)", border: "0.5px solid rgba(255,255,255,0.08)", padding: "1.1rem" }}>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.42)", marginBottom: "10px" }}>missed skill summary</div>
              <div style={{ display: "grid", gap: "10px" }}>
                {detail.missedAnalysis.length === 0 ? (
                  <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.54)", lineHeight: 1.7 }}>
                    No missed-skill summary was recorded because this saved run has no missed questions.
                  </div>
                ) : (
                  detail.missedAnalysis.map((item) => (
                    <div key={`${item.sectionKey}-${item.topicName}`} style={{ borderRadius: "14px", background: "rgba(255,255,255,0.03)", padding: "0.95rem 1rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "6px" }}>
                        <div>
                          <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "20px" }}>{item.topicName}</div>
                          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.36)", textTransform: "uppercase", letterSpacing: ".06em" }}>
                            {item.sectionTitle}
                          </div>
                        </div>
                        <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "24px", color: "#F4F0E8" }}>
                          {item.misses}
                        </div>
                      </div>
                      <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.54)" }}>
                        {item.misses} missed question{item.misses === 1 ? "" : "s"} tied to this skill area.
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section style={{ borderRadius: "18px", background: "rgba(255,255,255,0.035)", border: "0.5px solid rgba(255,255,255,0.08)", padding: "1.1rem" }}>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.42)", marginBottom: "10px" }}>missed-question review</div>
              <div style={{ display: "grid", gap: "12px" }}>
                {detail.missedQuestions.length === 0 ? (
                  <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.54)", lineHeight: 1.7 }}>
                    Clean run. No missed questions to review here.
                  </div>
                ) : (
                  detail.missedQuestions.map((item) => (
                    <div key={item.id} style={{ borderRadius: "14px", background: "rgba(255,255,255,0.03)", padding: "0.95rem 1rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", marginBottom: "8px" }}>
                        <div style={{ fontSize: "11px", color: "#5DCAA5", letterSpacing: ".06em", textTransform: "uppercase" }}>
                          {item.sectionTitle} · question {item.questionOrder + 1}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {item.flagged ? (
                            <span style={{ fontSize: "10px", color: "#5DCAA5", border: "0.5px solid rgba(93,202,165,0.45)", borderRadius: "999px", padding: "3px 8px", letterSpacing: ".04em", textTransform: "uppercase" }}>
                              marked for review
                            </span>
                          ) : null}
                          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.36)" }}>{item.topicName}</div>
                        </div>
                      </div>
                      {item.question.passage && (
                        <div style={{ fontSize: "12px", lineHeight: 1.7, color: "rgba(255,255,255,0.5)", marginBottom: "10px" }}>
                          {renderFormattedText(item.question.passage)}
                        </div>
                      )}
                      <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "20px", lineHeight: 1.55, marginBottom: "10px" }}>
                        {renderFormattedText(item.question.question_text)}
                      </div>
                      <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.54)", marginBottom: "8px" }}>
                        You chose {item.selectedAnswer}. Correct answer: {item.correctAnswer}.
                      </div>
                      <div style={{ fontSize: "12px", lineHeight: 1.7, color: "rgba(255,255,255,0.7)" }}>
                        {item.question.explanation}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <aside style={{ display: "grid", gap: "14px" }}>
            <section style={{ borderRadius: "18px", background: "rgba(255,255,255,0.035)", border: "0.5px solid rgba(255,255,255,0.08)", padding: "1.1rem" }}>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.42)", marginBottom: "10px" }}>section breakdown</div>
              <div style={{ display: "grid", gap: "10px" }}>
                {detail.sectionReports.map((section) => (
                  <div key={section.id} style={{ borderRadius: "14px", background: "rgba(255,255,255,0.03)", padding: "0.95rem 1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "6px" }}>
                      <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "22px" }}>{section.title}</div>
                      <div style={{ color: "#F4F0E8", fontFamily: "DM Serif Display,serif", fontSize: "24px" }}>
                        {section.estimatedScore ?? "--"}/36
                      </div>
                    </div>
                    <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.52)", marginBottom: "6px" }}>
                      {section.correctCount}/{section.questionCount} correct · {section.answeredCount} answered · {section.accuracyPct}% accuracy · {formatCountdown(section.durationSeconds)} of {formatCountdown(section.timeLimitSeconds)}
                    </div>
                    <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
                      {section.pacingSummary.label} · {section.pacingSummary.description}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section style={{ borderRadius: "18px", background: "rgba(255,255,255,0.035)", border: "0.5px solid rgba(255,255,255,0.08)", padding: "1.1rem" }}>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.42)", marginBottom: "10px" }}>next steps</div>
              <div style={{ fontSize: "13px", lineHeight: 1.75, color: "rgba(255,255,255,0.56)", marginBottom: "12px" }}>
                Review the misses here, then jump back into practice tests or your progress tab whenever you want a fuller trend view.
              </div>
              <div style={{ display: "grid", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  style={{
                    padding: "11px 12px",
                    borderRadius: "12px",
                    background: "transparent",
                    border: "0.5px solid rgba(241,153,123,0.3)",
                    color: "#F1997B",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontFamily: "DM Sans,sans-serif",
                  }}
                >
                  delete test
                </button>
                <button
                  onClick={() => router.push("/practice-tests")}
                  style={{
                    padding: "11px 12px",
                    borderRadius: "12px",
                    background: "#5DCAA5",
                    border: "none",
                    color: "#081018",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 600,
                    fontFamily: "DM Sans,sans-serif",
                  }}
                >
                  back to practice tests
                </button>
                <button
                  onClick={() => router.push("/progress")}
                  style={{
                    padding: "11px 12px",
                    borderRadius: "12px",
                    background: "transparent",
                    border: "0.5px solid rgba(255,255,255,0.12)",
                    color: "rgba(255,255,255,0.7)",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontFamily: "DM Sans,sans-serif",
                  }}
                >
                  open progress tab
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>
      {deleteOpen ? (
        <>
          <div
            onClick={() => {
              if (deleting) {
                return;
              }
              setDeleteOpen(false);
            }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(2, 6, 12, 0.72)",
              backdropFilter: "blur(10px)",
              zIndex: 60,
            }}
          />
          <div
            style={{
              position: "fixed",
              inset: "auto 1rem 1rem 1rem",
              margin: "0 auto",
              maxWidth: "520px",
              borderRadius: "20px",
              padding: "1.35rem",
              background:
                "linear-gradient(180deg, rgba(12, 28, 40, 0.98) 0%, rgba(6, 14, 23, 0.98) 100%)",
              border: "0.5px solid rgba(255,255,255,0.1)",
              boxShadow: "0 22px 60px rgba(0,0,0,0.4)",
              zIndex: 61,
            }}
          >
            <div style={{ fontSize: "11px", color: "#F1997B", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: "8px" }}>
              Delete test
            </div>
            <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "32px", lineHeight: 1.1, color: "#fff", marginBottom: "10px" }}>
              Delete this test result?
            </div>
            <div style={{ color: "rgba(255,255,255,0.68)", lineHeight: 1.7, fontSize: "14px", marginBottom: "1rem" }}>
              This will remove this score and its saved test history from your account.
            </div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.42)", marginBottom: "1.1rem" }}>
              {detail.title}
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
                style={{
                  flex: 1,
                  minWidth: "180px",
                  padding: "12px 14px",
                  borderRadius: "12px",
                  border: "0.5px solid rgba(255,255,255,0.12)",
                  background: "transparent",
                  color: "rgba(255,255,255,0.8)",
                  cursor: deleting ? "default" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteTest()}
                disabled={deleting}
                style={{
                  flex: 1,
                  minWidth: "180px",
                  padding: "12px 14px",
                  borderRadius: "12px",
                  border: "none",
                  background: "#F1997B",
                  color: "#1A0C0B",
                  cursor: deleting ? "default" : "pointer",
                  fontWeight: 600,
                }}
              >
                {deleting ? "Deleting..." : "Delete test"}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
