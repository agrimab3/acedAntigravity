"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  FULL_TESTS,
  PRACTICE_TEST_MODES,
  SECTION_TESTS,
} from "@/lib/practice-tests";
import MockTestNavTab from "@/components/MockTestNavTab";
import NightSky from "@/components/NightSky";
import { useOnboardingState } from "@/lib/use-onboarding-state";

function formatDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

const SECTION_TEST_TOPIC_COPY: Record<string, string> = {
  english:
    "Organization & Flow, Transitions & Cohesion, Precision & Concision, Style & Tone, Punctuation, Grammar & Usage, Sentence Structure.",
  math:
    "Number & Quantity, Algebra, Functions, Geometry, Statistics & Probability, Integrating Essential Skills, Modeling.",
  reading:
    "Literary Narrative, Social Science, Humanities, Natural Science.",
  science:
    "Data Representation, Research Summaries, Conflicting Viewpoints.",
};

const FULL_TEST_TOPIC_COPY: Record<string, string> = {
  "full-with-science": "English, Math, Reading, Science.",
  "full-core": "English, Math, Reading.",
};

function topModeAccent(modeKey: string) {
  return (
    PRACTICE_TEST_MODES.find((mode) => mode.key === modeKey)?.accentColor ??
    "rgba(255,255,255,0.74)"
  );
}

export default function PracticeTestsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { loading: onboardingLoading } = useOnboardingState(status, {
    redirectIfIncomplete: "/onboarding",
  });
  const [selectedModeKey, setSelectedModeKey] = useState(PRACTICE_TEST_MODES[0]?.key);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState<Array<{ role: "bot" | "user"; text: string }>>([
    {
      role: "bot",
      text: "Ask for test-day strategy, pacing help, or which stars to practice next and I’ll coach you through it.",
    },
  ]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [history, setHistory] = useState<
    Array<{
      sessionId: string;
      modeKey: string;
      title: string;
      shortLabel: string;
      format: "section" | "full";
      accuracyPct: number;
      compositeEstimatedScore: number | null;
      durationSeconds: number;
      completedAt: string | null;
      overallPacing: { label: string; description: string };
      sections: Array<{
        title: string;
        estimatedScore: number | null;
        accuracyPct: number;
        pacingSummary: { label: string };
      }>;
    }>
  >([]);
  const msgsRef = useRef<HTMLDivElement>(null);

  const selectedMode = useMemo(
    () => PRACTICE_TEST_MODES.find((mode) => mode.key === selectedModeKey) ?? PRACTICE_TEST_MODES[0],
    [selectedModeKey]
  );
  const selectedPreviewDescription =
    SECTION_TEST_TOPIC_COPY[selectedMode.key] ??
    FULL_TEST_TOPIC_COPY[selectedMode.key] ??
    selectedMode.description;

  useEffect(() => {
    setAiMessages([
      {
        role: "bot",
        text: `Ask about ${selectedMode.shortLabel.toLowerCase()} pacing, test-day strategy, or what stars to focus on after this run.`,
      },
    ]);
    setAiInput("");
  }, [selectedMode]);

  useEffect(() => {
    if (!msgsRef.current) return;
    msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [aiMessages]);

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

    const loadHistory = async () => {
      setHistoryLoading(true);
      setHistoryError(null);

      try {
        const res = await fetch("/api/practice-tests/history", {
          cache: "no-store",
        });

        if (!res.ok) {
          if (active) {
            setHistoryError("Your recent test history is unavailable right now. You can still start a new practice test.");
          }
          return;
        }

        const data = await res.json();

        if (active) {
          setHistory(data.history ?? []);
        }
      } catch (error) {
        console.error("Failed to load practice test history", error);
        if (active) {
          setHistoryError("Your recent test history is unavailable right now. You can still start a new practice test.");
        }
      } finally {
        if (active) {
          setHistoryLoading(false);
        }
      }
    };

    void loadHistory();

    return () => {
      active = false;
    };
  }, [status]);

  if (status === "loading" || onboardingLoading) {
    return (
      <div
        style={{
          background: "var(--sky-background)",
          minHeight: "100vh",
          color: "rgba(255,255,255,0.68)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "DM Sans,sans-serif",
        }}
      >
        loading practice tests...
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  const tutorSection =
    selectedMode.format === "section"
      ? selectedMode.sections[0]?.key ?? "english"
      : selectedMode.sections[0]?.key ?? "english";
  const tutorExplanation =
    selectedMode.format === "section"
      ? `The student is preparing for the ${selectedMode.title} ACT section test and wants pacing, strategy, and next-star recommendations.`
      : `The student is preparing for the ${selectedMode.title} ACT full test and wants pacing, strategy, and next-star recommendations.`;

  const sendAI = async () => {
    if (!aiInput.trim() || aiLoading) return;
    const msg = aiInput.trim();
    setAiInput("");
    setAiMessages((prev) => [...prev, { role: "user", text: msg }]);
    setAiLoading(true);

    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          question: `Help the student prepare for the ${selectedMode.title} practice test with timing, pacing, and recovery advice.`,
          section: tutorSection,
          explanation: tutorExplanation,
          officialCategory:
            selectedMode.format === "section"
              ? SECTION_TEST_TOPIC_COPY[selectedMode.key] ?? selectedMode.description
              : selectedMode.description,
        }),
      });

      const data = await res.json();
      setAiMessages((prev) => [
        ...prev,
        { role: "bot", text: data.reply ?? "I had trouble answering that. Try again in a second." },
      ]);
    } catch {
      setAiMessages((prev) => [
        ...prev,
        { role: "bot", text: "Sorry, I had trouble connecting. Try again in a second." },
      ]);
    }

    setAiLoading(false);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--sky-base)",
        color: "#fff",
        fontFamily: "DM Sans,sans-serif",
        position: "relative",
        overflowX: "hidden",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500&display=swap"
        rel="stylesheet"
      />
      <style>{`
        @media (max-width: 960px) {
          .practice-tests-layout {
            grid-template-columns: 1fr !important;
          }
          .practice-tests-aside {
            position: static !important;
          }
        }
      `}</style>
      <NightSky />
      <div style={{ padding: "1.5rem 1.5rem 2.5rem", maxWidth: "1240px", margin: "0 auto", position: "relative", zIndex: 3 }}>
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
            <button
              onClick={() => router.push("/dashboard")}
              style={{
                background: "transparent",
                border: "none",
                color: "rgba(255,255,255,0.78)",
                fontSize: "17px",
                fontWeight: 500,
                cursor: "pointer",
                padding: "6px 4px",
                position: "relative",
                textShadow: "0 0 14px rgba(255,255,255,0.18)",
                fontFamily: "DM Sans,sans-serif",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: "calc(100% + 22px)",
                  height: "20px",
                  transform: "translate(-50%, -50%)",
                  borderRadius: "999px",
                  background: "radial-gradient(circle, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.045) 58%, transparent 84%)",
                  filter: "blur(11px)",
                  zIndex: 0,
                  pointerEvents: "none",
                }}
              />
              <span style={{ position: "relative", zIndex: 1 }}>your universe</span>
            </button>
            <button
              style={{
                background: "transparent",
                border: "none",
                color: "#fff",
                fontSize: "17px",
                fontWeight: 500,
                cursor: "default",
                padding: "6px 4px",
                position: "relative",
                textShadow: "0 0 18px rgba(29,158,117,0.4)",
                fontFamily: "DM Sans,sans-serif",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: "calc(100% + 26px)",
                  height: "24px",
                  transform: "translate(-50%, -50%)",
                  borderRadius: "999px",
                  background: "radial-gradient(circle, rgba(29,158,117,0.26) 0%, rgba(29,158,117,0.12) 54%, transparent 82%)",
                  filter: "blur(12px)",
                  zIndex: 0,
                  pointerEvents: "none",
                }}
              />
              <span style={{ position: "relative", zIndex: 1 }}>practice tests</span>
            </button>
            <button
              onClick={() => router.push("/progress")}
              style={{
                background: "transparent",
                border: "none",
                color: "rgba(255,255,255,0.78)",
                fontSize: "17px",
                fontWeight: 500,
                cursor: "pointer",
                padding: "6px 4px",
                position: "relative",
                textShadow: "0 0 14px rgba(255,255,255,0.18)",
                fontFamily: "DM Sans,sans-serif",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: "calc(100% + 22px)",
                  height: "20px",
                  transform: "translate(-50%, -50%)",
                  borderRadius: "999px",
                  background: "radial-gradient(circle, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.045) 58%, transparent 84%)",
                  filter: "blur(11px)",
                  zIndex: 0,
                  pointerEvents: "none",
                }}
              />
              <span style={{ position: "relative", zIndex: 1 }}>progress</span>
            </button>
            <MockTestNavTab />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", justifySelf: "end" }}>
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.68)" }}>
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

        <div style={{ marginBottom: "2rem", maxWidth: "760px" }}>
          <h1
            style={{
              fontFamily: "DM Serif Display,serif",
              fontWeight: 400,
              fontSize: "clamp(2rem,4.2vw,3.6rem)",
              lineHeight: 1.08,
              marginBottom: "10px",
            }}
          >
            practice tests,
            <br />
            <em style={{ color: "#1D9E75" }}>written in the stars</em>
          </h1>
          <p
            style={{
              maxWidth: "640px",
              fontSize: "15px",
              lineHeight: 1.75,
              color: "rgba(255,255,255,0.56)",
            }}
          >
            Build from official ACT section timing, then level up into a full-test experience with section transitions,
            pacing feedback, and post-test star recovery plans.
          </p>
        </div>

        <div
          className="practice-tests-layout"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.95fr)",
            gap: "18px",
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: "18px" }}>
            <section
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "0.5px solid rgba(255,255,255,0.08)",
                borderRadius: "18px",
                padding: "1.2rem",
              }}
            >
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.68)", marginBottom: "0.9rem" }}>
                section tests
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                {SECTION_TESTS.map((mode) => {
                  const selected = mode.key === selectedMode.key;
                  return (
                    <div
                      key={mode.key}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedModeKey(mode.key)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedModeKey(mode.key);
                        }
                      }}
                      style={{
                        textAlign: "left",
                        borderRadius: "16px",
                        padding: "1rem",
                        border: selected
                          ? `0.5px solid ${mode.accentColor}66`
                          : "0.5px solid rgba(255,255,255,0.08)",
                        background: selected ? `${mode.accentColor}14` : "rgba(255,255,255,0.025)",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        outline: "none",
                        transition: "border-color 0.2s, background-color 0.2s",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "10px" }}>
                          <div>
                            <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "22px", color: mode.accentColor }}>
                              {mode.shortLabel}
                            </div>
                            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.68)" }}>{mode.constellation}</div>
                          </div>
                          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.68)", textAlign: "right" }}>
                            <div>{mode.questionCount} questions</div>
                            <div>{formatDuration(mode.durationMinutes)}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: "12px", lineHeight: 1.6, color: "rgba(255,255,255,0.5)", marginBottom: "12px" }}>
                          {SECTION_TEST_TOPIC_COPY[mode.key] ?? mode.description}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          paddingTop: "10px",
                          borderTop: "0.5px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <span style={{ fontSize: "11px", color: selected ? mode.accentColor : "rgba(255,255,255,0.36)" }}>
                          {selected ? "● active" : "select"}
                        </span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            router.push(`/practice-tests/run?mode=${mode.key}`);
                          }}
                          style={{
                            padding: "6px 14px",
                            borderRadius: "999px",
                            border: "none",
                            background: selected ? mode.accentColor : "rgba(255,255,255,0.1)",
                            color: selected ? "#081018" : "#fff",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "DM Sans,sans-serif",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          start section ✦
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "0.5px solid rgba(255,255,255,0.08)",
                borderRadius: "18px",
                padding: "1.2rem",
              }}
            >
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.68)", marginBottom: "0.9rem" }}>
                full test modes
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px" }}>
                {FULL_TESTS.map((mode) => {
                  const selected = mode.key === selectedMode.key;
                  return (
                    <div
                      key={mode.key}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedModeKey(mode.key)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedModeKey(mode.key);
                        }
                      }}
                      style={{
                        textAlign: "left",
                        borderRadius: "16px",
                        padding: "1rem",
                        border: selected
                          ? `0.5px solid ${mode.accentColor}66`
                          : "0.5px solid rgba(255,255,255,0.08)",
                        background: selected ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.025)",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        outline: "none",
                        transition: "border-color 0.2s, background-color 0.2s",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "10px" }}>
                          <div>
                            <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "22px", color: mode.accentColor }}>
                              {mode.shortLabel}
                            </div>
                            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.68)" }}>{mode.constellation}</div>
                          </div>
                          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.68)", textAlign: "right" }}>
                            <div>{mode.questionCount} questions</div>
                            <div>{formatDuration(mode.durationMinutes)}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: "12px", lineHeight: 1.6, color: "rgba(255,255,255,0.5)", marginBottom: "12px" }}>
                          {mode.description}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          paddingTop: "10px",
                          borderTop: "0.5px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <span style={{ fontSize: "11px", color: selected ? mode.accentColor : "rgba(255,255,255,0.36)" }}>
                          {selected ? "● active" : "select"}
                        </span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            router.push(`/practice-tests/run?mode=${mode.key}`);
                          }}
                          style={{
                            padding: "6px 14px",
                            borderRadius: "999px",
                            border: "none",
                            background: selected ? mode.accentColor : "rgba(255,255,255,0.1)",
                            color: selected ? "#081018" : "#fff",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "DM Sans,sans-serif",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          start full test ✦
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "0.5px solid rgba(255,255,255,0.08)",
                borderRadius: "18px",
                padding: "1.2rem",
              }}
            >
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.68)", marginBottom: "0.9rem" }}>
                recent test history
              </div>
              {historyLoading ? (
                <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.68)" }}>
                  loading recent timed runs...
                </div>
              ) : historyError ? (
                <div
                  role="status"
                  style={{
                    fontSize: "13px",
                    color: "rgba(255,255,255,0.58)",
                    lineHeight: 1.7,
                    borderLeft: "2px solid rgba(240, 153, 123, 0.7)",
                    paddingLeft: "0.8rem",
                  }}
                >
                  {historyError}
                </div>
              ) : history.length === 0 ? (
                <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>
                  Your completed practice tests will show up here with score and pacing reads once you start logging timed runs.
                </div>
              ) : (
                <div style={{ display: "grid", gap: "12px" }}>
                  {history.map((entry) => (
                    <div
                      key={entry.sessionId}
                      style={{
                        borderRadius: "16px",
                        padding: "1rem",
                        background: "rgba(255,255,255,0.025)",
                        border: "0.5px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "12px",
                          alignItems: "flex-start",
                          marginBottom: "8px",
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "24px", marginBottom: "4px" }}>
                            {entry.title}
                          </div>
                          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.68)" }}>
                            {entry.completedAt
                              ? new Date(entry.completedAt).toLocaleString([], {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                })
                              : "completed run"}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "28px", color: selectedMode.accentColor }}>
                            {entry.compositeEstimatedScore ? `${entry.compositeEstimatedScore}/36` : "--"}
                          </div>
                          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.68)" }}>
                            {entry.format === "full" ? "composite estimate" : "section estimate"}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px", marginBottom: "10px" }}>
                        {[
                          { value: `${entry.accuracyPct}%`, label: "accuracy" },
                          { value: formatDuration(Math.round(entry.durationSeconds / 60)), label: "duration" },
                          { value: entry.overallPacing.label, label: "pace" },
                        ].map((item) => (
                          <div
                            key={item.label}
                            style={{
                              borderRadius: "12px",
                              background: "rgba(255,255,255,0.03)",
                              padding: "0.8rem",
                              textAlign: "center",
                            }}
                          >
                            <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "20px", color: "#fff" }}>
                              {item.value}
                            </div>
                            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.68)" }}>{item.label}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: "10px" }}>
                        {entry.overallPacing.description}
                      </div>

                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {entry.sections.map((section) => (
                          <div
                            key={`${entry.sessionId}-${section.title}`}
                            style={{
                              padding: "8px 10px",
                              borderRadius: "999px",
                              background: "rgba(255,255,255,0.03)",
                              border: "0.5px solid rgba(255,255,255,0.08)",
                              fontSize: "11px",
                              color: "rgba(255,255,255,0.58)",
                            }}
                          >
                            {section.title} · {section.estimatedScore ?? "--"}/36 · {section.pacingSummary.label}
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
                        <button
                          onClick={() => router.push(`/practice-tests/history/${entry.sessionId}`)}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: topModeAccent(entry.modeKey ?? entry.shortLabel),
                            fontSize: "12px",
                            cursor: "pointer",
                            padding: 0,
                            fontFamily: "DM Sans,sans-serif",
                          }}
                        >
                          review missed questions →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside
            className="practice-tests-aside"
            style={{
              display: "grid",
              gap: "16px",
              position: "sticky",
              top: "1.5rem",
            }}
          >
            <section
              style={{
                background: "rgba(255,255,255,0.04)",
                border: `0.5px solid ${selectedMode.accentColor}55`,
                boxShadow: `0 0 0 1px ${selectedMode.accentColor}18 inset, 0 14px 38px rgba(0,0,0,0.18)`,
                borderRadius: "20px",
                padding: "1.25rem",
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "11px",
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: selectedMode.accentColor,
                  marginBottom: "10px",
                }}
              >
                {selectedMode.format === "section" ? "section test" : "full test"}
              </div>

              <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "30px", marginBottom: "10px" }}>
                {selectedMode.title}
              </div>
              <div style={{ fontSize: "13px", lineHeight: 1.7, color: "rgba(255,255,255,0.55)", marginBottom: "1rem" }}>
                {selectedPreviewDescription}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px", marginBottom: "1rem" }}>
                {[
                  { value: selectedMode.questionCount, label: "questions" },
                  { value: formatDuration(selectedMode.durationMinutes), label: "timed" },
                  { value: selectedMode.includesDesmos ? "desmos" : "focus", label: selectedMode.includesDesmos ? "math tool" : "mode" },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      borderRadius: "14px",
                      background: "rgba(255,255,255,0.035)",
                      border: `0.5px solid ${selectedMode.accentColor}22`,
                      padding: "0.9rem 0.8rem",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "24px", color: selectedMode.accentColor }}>
                      {item.value}
                    </div>
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.68)" }}>{item.label}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => router.push("/dashboard")}
                  style={{
                    flex: 1,
                    padding: "11px 12px",
                    borderRadius: "12px",
                    background: "transparent",
                    border: "0.5px solid rgba(255,255,255,0.12)",
                    color: "rgba(255,255,255,0.7)",
                    cursor: "pointer",
                    fontSize: "13px",
                  }}
                >
                  back to universe
                </button>
                <button
                  onClick={() => {
                    router.push(`/practice-tests/run?mode=${selectedMode.key}`);
                  }}
                  style={{
                    flex: 1.4,
                    padding: "11px 12px",
                    borderRadius: "12px",
                    background: selectedMode.accentColor,
                    border: "none",
                    color: "#081018",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 600,
                    opacity: 0.92,
                    boxShadow: `0 0 26px ${selectedMode.accentColor}26`,
                  }}
                >
                  {selectedMode.format === "section" ? "start section ✦" : "start full test ✦"}
                </button>
              </div>
            </section>

            <section
              style={{
                background: "rgba(8,14,22,0.72)",
                border: `0.5px solid ${selectedMode.accentColor}1f`,
                borderRadius: "20px",
                padding: "1rem",
              }}
            >
              <div style={{ fontSize: "10px", letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(255,255,255,0.68)", marginBottom: "6px" }}>
                ask your AI tutor
              </div>
              <div style={{ fontSize: "12px", lineHeight: 1.6, color: "rgba(255,255,255,0.68)", marginBottom: "0.85rem" }}>
                Ask for test-day strategy, section pacing tips, or which stars to focus on next.
              </div>
              <div
                ref={msgsRef}
                style={{
                  display: "grid",
                  gap: "8px",
                  maxHeight: "220px",
                  overflowY: "auto",
                  marginBottom: "0.9rem",
                  paddingRight: "4px",
                }}
              >
                {aiMessages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    style={{
                      justifySelf: message.role === "user" ? "end" : "stretch",
                      maxWidth: message.role === "user" ? "86%" : "100%",
                      borderRadius: "16px",
                      padding: "11px 13px",
                      background:
                        message.role === "user"
                          ? "rgba(255,255,255,0.07)"
                          : "rgba(29,158,117,0.08)",
                      border:
                        message.role === "user"
                          ? "0.5px solid rgba(255,255,255,0.08)"
                          : "0.5px solid rgba(255,255,255,0.08)",
                      color: message.role === "user" ? "#fff" : "rgba(255,255,255,0.72)",
                      fontSize: "13px",
                      lineHeight: 1.65,
                    }}
                  >
                    {message.text}
                  </div>
                ))}
                {aiLoading && (
                  <div
                    style={{
                      borderRadius: "14px",
                      padding: "10px 12px",
                      background: "rgba(29,158,117,0.08)",
                      border: "0.5px solid rgba(255,255,255,0.08)",
                      color: "rgba(255,255,255,0.5)",
                      fontSize: "13px",
                    }}
                  >
                    Aced is thinking...
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "stretch" }}>
                <input
                  value={aiInput}
                  onChange={(event) => setAiInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void sendAI();
                    }
                  }}
                  placeholder="ask about pacing, strategy, or next stars..."
                  style={{
                    flex: 1,
                    borderRadius: "999px",
                    border: "0.5px solid rgba(255,255,255,0.12)",
                    background: "rgba(10,16,24,0.82)",
                    color: "#fff",
                    padding: "11px 14px",
                    fontSize: "13px",
                    fontFamily: "DM Sans,sans-serif",
                    outline: "none",
                  }}
                />
                <button
                  onClick={() => void sendAI()}
                  disabled={aiLoading || !aiInput.trim()}
                  style={{
                    alignSelf: "center",
                    width: "36px",
                    height: "36px",
                    minWidth: "36px",
                    borderRadius: "999px",
                    border: "none",
                    background: selectedMode.accentColor,
                    color: "#081018",
                    cursor: aiLoading || !aiInput.trim() ? "default" : "pointer",
                    opacity: aiLoading || !aiInput.trim() ? 0.5 : 0.95,
                    fontSize: "16px",
                    fontWeight: 600,
                    fontFamily: "DM Sans,sans-serif",
                  }}
                >
                  ↗
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
