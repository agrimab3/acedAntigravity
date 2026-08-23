"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useOnboardingState } from "@/lib/use-onboarding-state";

const PROGRESS_GALAXY_BACKGROUND =
  "radial-gradient(circle at 18% 16%, rgba(74, 128, 178, 0.12), transparent 32%), radial-gradient(circle at 74% 24%, rgba(88, 138, 188, 0.08), transparent 34%), radial-gradient(circle at 52% 72%, rgba(120, 136, 182, 0.06), transparent 40%), linear-gradient(180deg,#0d1b2a 0%,#081221 44%,#020408 100%)";

const SECTION_ACCENTS: Record<string, string> = {
  english: "#5DCAA5",
  math: "#AFA9EC",
  reading: "#EF9F27",
  science: "#F0997B",
};

function formatDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
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

export default function ProgressPage() {
  const router = useRouter();
  const { status, data: session } = useSession();
  const { loading: onboardingLoading } = useOnboardingState(status, {
    redirectIfIncomplete: "/onboarding",
  });
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<{
    totals: {
      drillsCompleted: number;
      testRunsCompleted: number;
      questionsAnswered: number;
      totalMinutes: number;
      averageDrillAccuracyPct: number;
      averageTestAccuracyPct: number;
      litStars: number;
      strongStars: number;
    };
    sectionProgress: Array<{
      sectionKey: string;
      completedDrills: number;
      totalQuestions: number;
      averageAccuracyPct: number;
      lastPracticedAt: string | null;
    }>;
    recentDrills: Array<{
      sessionId: string;
      sectionKey: string;
      topicName: string;
      questionCount: number;
      correctCount: number;
      accuracyPct: number;
      durationSeconds: number;
      completedAt: string | null;
    }>;
    recentTests: Array<{
      sessionId: string;
      modeKey: string;
      title: string;
      format: string;
      accuracyPct: number;
      estimatedScore: number | null;
      durationSeconds: number;
      completedAt: string | null;
    }>;
  } | null>(null);
  const [openTestMenuId, setOpenTestMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    sessionId: string;
    title: string;
  } | null>(null);
  const [deletingTestId, setDeletingTestId] = useState<string | null>(null);
  const [historyFeedback, setHistoryFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [router, status]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    let active = true;

    const loadProgress = async () => {
      setLoading(true);

      try {
        const res = await fetch("/api/progress", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (active) {
          setProgress(data);
        }
      } catch (error) {
        console.error("Failed to load progress", error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadProgress();

    return () => {
      active = false;
    };
  }, [status]);

  useEffect(() => {
    if (!historyFeedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setHistoryFeedback(null);
    }, 2600);

    return () => window.clearTimeout(timeoutId);
  }, [historyFeedback]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const nextMessage = new URLSearchParams(window.location.search).get("historyMessage");

    if (nextMessage === "test-deleted") {
      setHistoryFeedback({
        tone: "success",
        message: "test deleted",
      });
      router.replace("/progress");
    }
  }, [router]);

  useEffect(() => {
    if (!openTestMenuId) {
      return;
    }

    const closeMenu = () => setOpenTestMenuId(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, [openTestMenuId]);

  async function handleDeleteTest() {
    if (!deleteTarget) {
      return;
    }

    setDeletingTestId(deleteTarget.sessionId);

    try {
      const res = await fetch(`/api/practice-tests/history/${deleteTarget.sessionId}`, {
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

      const progressRes = await fetch("/api/progress", { cache: "no-store" });
      if (progressRes.ok) {
        const nextProgress = await progressRes.json();
        setProgress(nextProgress);
      }

      setDeleteTarget(null);
      setOpenTestMenuId(null);
      setHistoryFeedback({
        tone: "success",
        message: "test deleted",
      });
    } catch (error) {
      console.error("Failed to delete practice test history", error);
      setHistoryFeedback({
        tone: "error",
        message:
          error instanceof Error ? error.message : "couldn't delete this test. try again.",
      });
    } finally {
      setDeletingTestId(null);
    }
  }

  if (status === "loading" || onboardingLoading || loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: PROGRESS_GALAXY_BACKGROUND,
          color: "rgba(255,255,255,0.46)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "DM Sans,sans-serif",
        }}
      >
        loading progress...
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: PROGRESS_GALAXY_BACKGROUND,
        color: "#fff",
        fontFamily: "DM Sans,sans-serif",
        position: "relative",
      }}
    >
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
            border:
              historyFeedback.tone === "success"
                ? "0.5px solid rgba(93,202,165,0.32)"
                : "0.5px solid rgba(240,153,123,0.32)",
            background:
              historyFeedback.tone === "success"
                ? "rgba(8, 26, 22, 0.92)"
                : "rgba(30, 14, 14, 0.92)",
            color:
              historyFeedback.tone === "success"
                ? "rgba(226,255,245,0.92)"
                : "rgba(255,230,222,0.94)",
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "2.2rem",
              justifySelf: "center",
            }}
          >
            {[
              { label: "your universe", onClick: () => router.push("/dashboard"), active: false },
              { label: "practice tests", onClick: () => router.push("/practice-tests"), active: false },
              { label: "progress", onClick: undefined, active: true },
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

        <div style={{ marginBottom: "1.8rem", maxWidth: "760px" }}>
          <h1
            style={{
              fontFamily: "DM Serif Display,serif",
              fontWeight: 400,
              fontSize: "clamp(2rem,4vw,3.5rem)",
              lineHeight: 1.08,
              marginBottom: "10px",
            }}
          >
            your progress,
            <br />
            <em style={{ color: "#1D9E75" }}>saved in the stars</em>
          </h1>
          <p style={{ fontSize: "15px", lineHeight: 1.75, color: "rgba(255,255,255,0.56)" }}>
            Every drill, timed test, and mastery update is already being stored. This tab turns that saved work into a cleaner progress view.
          </p>
        </div>

        {progress && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: "12px", marginBottom: "1.4rem" }}>
              {[
                { value: progress.totals.drillsCompleted, label: "drills" },
                { value: progress.totals.testRunsCompleted, label: "test runs" },
                { value: progress.totals.questionsAnswered, label: "questions" },
                { value: `${progress.totals.averageDrillAccuracyPct}%`, label: "drill accuracy" },
                { value: `${progress.totals.averageTestAccuracyPct}%`, label: "test accuracy" },
                { value: `${progress.totals.strongStars}/${progress.totals.litStars}`, label: "strong stars" },
              ].map((item) => (
                <div key={item.label} style={{ borderRadius: "16px", background: "rgba(255,255,255,0.04)", padding: "1rem" }}>
                  <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "30px", color: "#F4F0E8", marginBottom: "4px" }}>
                    {item.value}
                  </div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.34)" }}>{item.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(340px, 0.95fr)", gap: "18px", alignItems: "start" }}>
              <div style={{ display: "grid", gap: "16px" }}>
                <section style={{ borderRadius: "18px", background: "rgba(255,255,255,0.035)", border: "0.5px solid rgba(255,255,255,0.08)", padding: "1.1rem" }}>
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.42)", marginBottom: "10px" }}>section progress</div>
                  <div style={{ display: "grid", gap: "10px" }}>
                    {progress.sectionProgress.map((section) => (
                      <div
                        key={section.sectionKey}
                        style={{
                          borderRadius: "14px",
                          background: "rgba(255,255,255,0.03)",
                          border: `0.5px solid ${(SECTION_ACCENTS[section.sectionKey] ?? "#fff")}22`,
                          padding: "0.95rem 1rem",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", marginBottom: "6px" }}>
                          <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "22px", color: SECTION_ACCENTS[section.sectionKey] ?? "#fff", textTransform: "capitalize" }}>
                            {section.sectionKey}
                          </div>
                          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>
                            {section.completedDrills} drills
                          </div>
                        </div>
                        <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.54)", lineHeight: 1.7 }}>
                          {section.averageAccuracyPct}% average accuracy · {section.totalQuestions} questions practiced ·{" "}
                          {section.lastPracticedAt
                            ? new Date(section.lastPracticedAt).toLocaleDateString([], { month: "short", day: "numeric" })
                            : "not yet practiced"}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section style={{ borderRadius: "18px", background: "rgba(255,255,255,0.035)", border: "0.5px solid rgba(255,255,255,0.08)", padding: "1.1rem" }}>
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.42)", marginBottom: "10px" }}>recent drills</div>
                  <div style={{ display: "grid", gap: "10px" }}>
                    {progress.recentDrills.length === 0 ? (
                      <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>
                        Your saved drill sessions will show up here once you start practicing stars.
                      </div>
                    ) : (
                      progress.recentDrills.map((drill) => (
                        <div key={drill.sessionId} style={{ borderRadius: "14px", background: "rgba(255,255,255,0.03)", padding: "0.95rem 1rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "6px" }}>
                            <div>
                              <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "22px" }}>{drill.topicName}</div>
                              <div style={{ fontSize: "11px", color: SECTION_ACCENTS[drill.sectionKey] ?? "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: ".06em" }}>
                                {drill.sectionKey}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "24px", color: SECTION_ACCENTS[drill.sectionKey] ?? "#fff" }}>
                                {drill.accuracyPct}%
                              </div>
                              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.34)" }}>accuracy</div>
                            </div>
                          </div>
                          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.52)" }}>
                            {drill.correctCount}/{drill.questionCount} correct · {formatDuration(Math.round(drill.durationSeconds / 60))} ·{" "}
                            {drill.completedAt
                              ? new Date(drill.completedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                              : "saved"}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>

              <section style={{ borderRadius: "18px", background: "rgba(255,255,255,0.035)", border: "0.5px solid rgba(255,255,255,0.08)", padding: "1.1rem" }}>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.42)", marginBottom: "10px" }}>saved test history</div>
                <div style={{ display: "grid", gap: "10px" }}>
                  {progress.recentTests.length === 0 ? (
                    <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>
                      Timed-test progress will show up here after your first completed run.
                    </div>
                  ) : (
                    progress.recentTests.map((test) => (
                      <div
                        key={test.sessionId}
                        style={{
                          borderRadius: "14px",
                          background: "rgba(255,255,255,0.03)",
                          padding: "0.95rem 1rem",
                          position: "relative",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "8px", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "22px" }}>{test.title}</div>
                            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.34)" }}>
                              {formatHistoryTimestamp(test.completedAt)}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "24px", color: "#F4F0E8" }}>
                                {test.estimatedScore ? `${test.estimatedScore}/36` : "--"}
                              </div>
                              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.34)" }}>
                                {test.format === "full" ? "composite estimate" : "section estimate"}
                              </div>
                            </div>
                            <div
                              onClick={(event) => event.stopPropagation()}
                              style={{ position: "relative" }}
                            >
                              <button
                                type="button"
                                aria-label={`More actions for ${test.title}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setOpenTestMenuId((current) =>
                                    current === test.sessionId ? null : test.sessionId
                                  );
                                }}
                                style={{
                                  width: "34px",
                                  height: "34px",
                                  borderRadius: "999px",
                                  border: "0.5px solid rgba(255,255,255,0.12)",
                                  background: "rgba(255,255,255,0.04)",
                                  color: "rgba(255,255,255,0.66)",
                                  cursor: "pointer",
                                  fontSize: "18px",
                                  lineHeight: 1,
                                }}
                              >
                                ⋯
                              </button>
                              {openTestMenuId === test.sessionId ? (
                                <div
                                  style={{
                                    position: "absolute",
                                    top: "40px",
                                    right: 0,
                                    minWidth: "160px",
                                    borderRadius: "14px",
                                    border: "0.5px solid rgba(255,255,255,0.1)",
                                    background:
                                      "linear-gradient(180deg, rgba(12, 24, 35, 0.98) 0%, rgba(7, 15, 24, 0.98) 100%)",
                                    boxShadow: "0 18px 40px rgba(0,0,0,0.34)",
                                    padding: "8px",
                                    zIndex: 10,
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDeleteTarget({
                                        sessionId: test.sessionId,
                                        title: test.title,
                                      });
                                      setOpenTestMenuId(null);
                                    }}
                                    style={{
                                      width: "100%",
                                      padding: "10px 12px",
                                      borderRadius: "10px",
                                      border: "none",
                                      background: "transparent",
                                      color: "#F1997B",
                                      cursor: "pointer",
                                      textAlign: "left",
                                      fontSize: "12px",
                                      fontFamily: "DM Sans,sans-serif",
                                    }}
                                  >
                                    Delete test
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.52)", marginBottom: "10px" }}>
                          {test.accuracyPct}% accuracy · {formatDuration(Math.round(test.durationSeconds / 60))}
                        </div>
                        <button
                          onClick={() => router.push(`/practice-tests/history/${test.sessionId}`)}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "#5DCAA5",
                            fontSize: "12px",
                            cursor: "pointer",
                            padding: 0,
                            fontFamily: "DM Sans,sans-serif",
                          }}
                        >
                          view details →
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
      {deleteTarget ? (
        <>
          <div
            onClick={() => {
              if (deletingTestId) {
                return;
              }
              setDeleteTarget(null);
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
              {deleteTarget.title}
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={Boolean(deletingTestId)}
                style={{
                  flex: 1,
                  minWidth: "180px",
                  padding: "12px 14px",
                  borderRadius: "12px",
                  border: "0.5px solid rgba(255,255,255,0.12)",
                  background: "transparent",
                  color: "rgba(255,255,255,0.8)",
                  cursor: deletingTestId ? "default" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteTest()}
                disabled={Boolean(deletingTestId)}
                style={{
                  flex: 1,
                  minWidth: "180px",
                  padding: "12px 14px",
                  borderRadius: "12px",
                  border: "none",
                  background: "#F1997B",
                  color: "#1A0C0B",
                  cursor: deletingTestId ? "default" : "pointer",
                  fontWeight: 600,
                }}
              >
                {deletingTestId ? "Deleting..." : "Delete test"}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
