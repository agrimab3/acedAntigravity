"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  FULL_TESTS,
  PRACTICE_TEST_MODES,
  SECTION_TESTS,
} from "@/lib/practice-tests";

function formatDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function seededValue(seed: number) {
  const value = Math.sin(seed * 999.913) * 10000;
  return value - Math.floor(value);
}

function buildPracticeTestAmbientStars(count: number) {
  const columns = 10;
  const rows = Math.ceil(count / columns);

  return Array.from({ length: count }, (_, index) => {
    const seed = index + 1;
    const variant = index % 3;
    const column = index % columns;
    const row = Math.floor(index / columns);
    const leftBase = ((column + 0.5) / columns) * 100;
    const topBase = ((row + 0.5) / rows) * 100;

    return {
      id: index,
      left: `${clampPercent(leftBase + (seededValue(seed) - 0.5) * 8, 2, 98)}%`,
      top: `${clampPercent(topBase + (seededValue(seed + 20) - 0.5) * 10, 3, 97)}%`,
      size: 0.7 + seededValue(seed + 40) * 2.2,
      opacity: 0.08 + seededValue(seed + 60) * 0.34,
      duration: 7 + seededValue(seed + 80) * 10,
      delay: seededValue(seed + 100) * 6,
      animationName:
        variant === 0
          ? "practiceTestStarFloatA"
          : variant === 1
            ? "practiceTestStarFloatB"
            : "practiceTestStarFloatC",
    };
  });
}

function buildPracticeTestAmbientGlows(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const seed = index + 101;
    return {
      id: index,
      left: `${6 + seededValue(seed) * 88}%`,
      top: `${8 + seededValue(seed + 20) * 82}%`,
      size: 120 + seededValue(seed + 40) * 220,
      opacity: 0.04 + seededValue(seed + 60) * 0.08,
      duration: 16 + seededValue(seed + 80) * 16,
      delay: seededValue(seed + 100) * 5,
    };
  });
}

function clampPercent(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const SECTION_TEST_TOPIC_COPY: Record<string, string> = {
  english:
    "Organization & Flow, Transitions & Cohesion, Precision & Concision, Style & Tone, Punctuation, Grammar & Usage, and Sentence Structure under official pacing.",
  math:
    "Number & Quantity, Algebra, Functions, Geometry, Statistics & Probability, Integrating Essential Skills, and Modeling with calculator support.",
  reading:
    "Literary Narrative, Social Science, Humanities, and Natural Science passage work with real ACT-style timing pressure.",
  science:
    "Data Representation, Research Summaries, and Conflicting Viewpoints with experiment reading, data comparison, and inference pressure.",
};

const PRACTICE_TEST_GALAXY_BACKGROUND =
  "radial-gradient(circle at 18% 16%, rgba(74, 128, 178, 0.12), transparent 32%), radial-gradient(circle at 74% 24%, rgba(88, 138, 188, 0.08), transparent 34%), radial-gradient(circle at 52% 72%, rgba(120, 136, 182, 0.06), transparent 40%), linear-gradient(180deg,#0d1b2a 0%,#081221 44%,#020408 100%)";

export default function PracticeTestsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
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
  const [history, setHistory] = useState<
    Array<{
      sessionId: string;
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
  const backgroundStars = useMemo(
    () => buildPracticeTestAmbientStars(78),
    []
  );
  const backgroundGlows = useMemo(
    () => buildPracticeTestAmbientGlows(8),
    []
  );

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

      try {
        const res = await fetch("/api/practice-tests/history", {
          cache: "no-store",
        });

        if (!res.ok) {
          return;
        }

        const data = await res.json();

        if (active) {
          setHistory(data.history ?? []);
        }
      } catch (error) {
        console.error("Failed to load practice test history", error);
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

  if (status === "loading") {
    return (
      <div
        style={{
          background: PRACTICE_TEST_GALAXY_BACKGROUND,
          minHeight: "100vh",
          color: "rgba(255,255,255,0.45)",
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
        @keyframes practiceTestStarFloatA {
          0% { transform: translate3d(0, 0, 0) scale(0.92); opacity: 0.12; }
          50% { transform: translate3d(12px, -10px, 0) scale(1.08); opacity: 0.68; }
          100% { transform: translate3d(0, 0, 0) scale(0.92); opacity: 0.12; }
        }
        @keyframes practiceTestStarFloatB {
          0% { transform: translate3d(0, 0, 0) scale(0.94); opacity: 0.1; }
          50% { transform: translate3d(-10px, -7px, 0) scale(1.04); opacity: 0.6; }
          100% { transform: translate3d(0, 0, 0) scale(0.94); opacity: 0.1; }
        }
        @keyframes practiceTestStarFloatC {
          0% { transform: translate3d(0, 0, 0) scale(0.9); opacity: 0.1; }
          50% { transform: translate3d(8px, -14px, 0) scale(1.06); opacity: 0.62; }
          100% { transform: translate3d(0, 0, 0) scale(0.9); opacity: 0.1; }
        }
        @keyframes practiceTestNebulaPulse {
          0% { transform: scale(0.94); opacity: 0.35; }
          50% { transform: scale(1.05); opacity: 0.7; }
          100% { transform: scale(0.94); opacity: 0.35; }
        }
      `}</style>
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          background: PRACTICE_TEST_GALAXY_BACKGROUND,
        }}
      />
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1 }}>
        {backgroundGlows.map((glow) => (
          <span
            key={`glow-${glow.id}`}
            style={{
              position: "absolute",
              left: glow.left,
              top: glow.top,
              width: `${glow.size}px`,
              height: `${glow.size}px`,
              transform: "translate(-50%, -50%)",
              borderRadius: "999px",
              background:
                glow.id % 3 === 0
                  ? "radial-gradient(circle, rgba(112, 188, 222, 0.12) 0%, rgba(112, 188, 222, 0.03) 48%, transparent 78%)"
                  : glow.id % 3 === 1
                    ? "radial-gradient(circle, rgba(176, 188, 236, 0.1) 0%, rgba(176, 188, 236, 0.025) 48%, transparent 80%)"
                    : "radial-gradient(circle, rgba(146, 196, 187, 0.09) 0%, rgba(146, 196, 187, 0.02) 50%, transparent 80%)",
              opacity: glow.opacity * 0.7,
              filter: "blur(24px)",
              animation: `practiceTestNebulaPulse ${glow.duration}s ease-in-out ${glow.delay}s infinite`,
              display: "block",
            }}
          />
        ))}
        {backgroundStars.map((star) => (
          <span
            key={`ambient-star-${star.id}`}
            style={{
              position: "absolute",
              left: star.left,
              top: star.top,
              width: `${star.size}px`,
              height: `${star.size}px`,
              borderRadius: "999px",
              background: "rgba(255,255,255,0.96)",
              opacity: star.opacity,
              boxShadow:
                star.size > 2
                  ? "0 0 18px rgba(255,255,255,0.46), 0 0 30px rgba(255,255,255,0.16)"
                  : "0 0 10px rgba(255,255,255,0.32)",
              animation: `${star.animationName} ${star.duration}s ease-in-out ${star.delay}s infinite`,
              willChange: "transform, opacity",
              display: "block",
            }}
          />
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 2,
          background:
            "radial-gradient(circle at 50% 26%, rgba(5, 12, 24, 0.08), transparent 20%), linear-gradient(180deg, rgba(5,12,24,0.2) 0%, rgba(5,12,24,0.12) 22%, rgba(5,12,24,0.08) 48%, rgba(5,12,24,0.1) 68%, rgba(5,12,24,0.16) 100%)",
        }}
      />

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
              gap: "2.8rem",
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
                textShadow: "0 0 12px rgba(255,255,255,0.12)",
                fontFamily: "DM Sans,sans-serif",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: "calc(100% + 18px)",
                  height: "18px",
                  transform: "translate(-50%, -50%)",
                  borderRadius: "999px",
                  background: "radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 56%, transparent 82%)",
                  filter: "blur(10px)",
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
                textShadow: "0 0 14px rgba(29,158,117,0.28)",
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
                  background: "radial-gradient(circle, rgba(29,158,117,0.2) 0%, rgba(29,158,117,0.08) 52%, transparent 80%)",
                  filter: "blur(10px)",
                  zIndex: 0,
                  pointerEvents: "none",
                }}
              />
              <span style={{ position: "relative", zIndex: 1 }}>practice tests</span>
            </button>
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
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginBottom: "0.9rem" }}>
                section tests
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                {SECTION_TESTS.map((mode) => {
                  const selected = mode.key === selectedMode.key;
                  return (
                    <button
                      key={mode.key}
                      onClick={() => setSelectedModeKey(mode.key)}
                      style={{
                        textAlign: "left",
                        borderRadius: "16px",
                        padding: "1rem",
                        border: selected
                          ? `0.5px solid ${mode.accentColor}66`
                          : "0.5px solid rgba(255,255,255,0.08)",
                        background: selected ? `${mode.accentColor}14` : "rgba(255,255,255,0.025)",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "10px" }}>
                        <div>
                          <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "22px", color: mode.accentColor }}>
                            {mode.shortLabel}
                          </div>
                          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>{mode.constellation}</div>
                        </div>
                        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.42)", textAlign: "right" }}>
                          <div>{mode.questionCount} questions</div>
                          <div>{formatDuration(mode.durationMinutes)}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: "12px", lineHeight: 1.6, color: "rgba(255,255,255,0.5)" }}>
                        {SECTION_TEST_TOPIC_COPY[mode.key] ?? mode.description}
                      </div>
                    </button>
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
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginBottom: "0.9rem" }}>
                full test modes
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px" }}>
                {FULL_TESTS.map((mode) => {
                  const selected = mode.key === selectedMode.key;
                  return (
                    <button
                      key={mode.key}
                      onClick={() => setSelectedModeKey(mode.key)}
                      style={{
                        textAlign: "left",
                        borderRadius: "16px",
                        padding: "1rem",
                        border: selected
                          ? `0.5px solid ${mode.accentColor}66`
                          : "0.5px solid rgba(255,255,255,0.08)",
                        background: selected ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.025)",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "10px" }}>
                        <div>
                          <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "22px", color: mode.accentColor }}>
                            {mode.shortLabel}
                          </div>
                          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>{mode.constellation}</div>
                        </div>
                        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.42)", textAlign: "right" }}>
                          <div>{mode.questionCount} questions</div>
                          <div>{formatDuration(mode.durationMinutes)}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: "12px", lineHeight: 1.6, color: "rgba(255,255,255,0.5)" }}>{mode.description}</div>
                    </button>
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
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginBottom: "0.9rem" }}>
                recent test history
              </div>
              {historyLoading ? (
                <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)" }}>
                  loading recent timed runs...
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
                          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.34)" }}>
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
                          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.34)" }}>
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
                            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.32)" }}>{item.label}</div>
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
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside
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
                {selectedMode.description}
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
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.32)" }}>{item.label}</div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  borderRadius: "14px",
                  background: "rgba(255,255,255,0.03)",
                  border: `0.5px solid ${selectedMode.accentColor}20`,
                  padding: "0.95rem 1rem",
                  marginBottom: "1rem",
                }}
              >
                <div style={{ fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: "rgba(255,255,255,0.34)", marginBottom: "8px" }}>
                  section flow
                </div>
                <div style={{ display: "grid", gap: "8px" }}>
                  {selectedMode.sections.map((section, index) => (
                    <div
                      key={section.key}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        fontSize: "12px",
                        color: "rgba(255,255,255,0.62)",
                      }}
                    >
                      <span>
                        {index + 1}. {section.label}
                      </span>
                      <span style={{ color: "rgba(255,255,255,0.36)" }}>
                        {section.questionCount}q · {section.durationMinutes}m
                      </span>
                    </div>
                  ))}
                </div>
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
                background: "rgba(255,255,255,0.035)",
                border: `0.5px solid ${selectedMode.accentColor}33`,
                boxShadow: `0 0 0 1px ${selectedMode.accentColor}14 inset`,
                borderRadius: "20px",
                padding: "1.05rem 1rem",
              }}
            >
              <div style={{ fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: selectedMode.accentColor, marginBottom: "8px" }}>
                ask your AI tutor
              </div>
              <div style={{ fontSize: "12px", lineHeight: 1.7, color: "rgba(255,255,255,0.54)", marginBottom: "0.9rem" }}>
                Ask for test-day strategy, section pacing tips, or which stars to focus on next.
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "stretch", marginBottom: "0.9rem" }}>
                <textarea
                  value={aiInput}
                  onChange={(event) => setAiInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendAI();
                    }
                  }}
                  placeholder="ask about pacing, strategy, or next stars..."
                  rows={2}
                  style={{
                    flex: 1,
                    resize: "none",
                    borderRadius: "12px",
                    border: "0.5px solid rgba(255,255,255,0.12)",
                    background: "rgba(8,16,24,0.76)",
                    color: "#fff",
                    padding: "10px 12px",
                    fontSize: "12px",
                    fontFamily: "DM Sans,sans-serif",
                    outline: "none",
                  }}
                />
                <button
                  onClick={() => void sendAI()}
                  disabled={aiLoading || !aiInput.trim()}
                  style={{
                    alignSelf: "stretch",
                    padding: "0 14px",
                    borderRadius: "12px",
                    border: "none",
                    background: selectedMode.accentColor,
                    color: "#081018",
                    cursor: aiLoading || !aiInput.trim() ? "default" : "pointer",
                    opacity: aiLoading || !aiInput.trim() ? 0.5 : 0.95,
                    fontSize: "12px",
                    fontWeight: 600,
                    fontFamily: "DM Sans,sans-serif",
                  }}
                >
                  send
                </button>
              </div>
              <div
                ref={msgsRef}
                style={{
                  display: "grid",
                  gap: "8px",
                  maxHeight: "220px",
                  overflowY: "auto",
                  paddingRight: "4px",
                }}
              >
                {aiMessages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    style={{
                      justifySelf: message.role === "user" ? "end" : "stretch",
                      maxWidth: message.role === "user" ? "86%" : "100%",
                      borderRadius: "14px",
                      padding: "10px 12px",
                      background:
                        message.role === "user"
                          ? `${selectedMode.accentColor}1a`
                          : "rgba(255,255,255,0.04)",
                      border:
                        message.role === "user"
                          ? `0.5px solid ${selectedMode.accentColor}33`
                          : "0.5px solid rgba(255,255,255,0.08)",
                      color: message.role === "user" ? "#fff" : "rgba(255,255,255,0.72)",
                      fontSize: "12px",
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
                      background: "rgba(255,255,255,0.04)",
                      border: "0.5px solid rgba(255,255,255,0.08)",
                      color: "rgba(255,255,255,0.5)",
                      fontSize: "12px",
                    }}
                  >
                    Aced is thinking...
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
