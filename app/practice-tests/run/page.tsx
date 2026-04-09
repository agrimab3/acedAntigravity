"use client";

import { Fragment, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  PRACTICE_TEST_MODES,
  SECTION_TESTS,
  type PracticeTestMode,
  type PracticeTestSectionKey,
} from "@/lib/practice-tests";

type TestQuestion = {
  id: string;
  section: string;
  topic: string;
  difficulty: string;
  passage?: string | null;
  question_text: string;
  choices: { A: string; B: string; C: string; D: string };
  correct_answer: "A" | "B" | "C" | "D";
  explanation: string;
};

function formatDurationLabel(minutes: number) {
  if (minutes < 60) {
    return `${minutes} minutes`;
  }

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
}

function formatCountdown(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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

function PracticeTestRunContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const modeKey = searchParams.get("mode");
  const mode = useMemo(
    () => PRACTICE_TEST_MODES.find((entry) => entry.key === modeKey) ?? null,
    [modeKey]
  );

  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [started, setStarted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, "A" | "B" | "C" | "D" | null>>({});
  const [flagged, setFlagged] = useState<number[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [usedMockFill, setUsedMockFill] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [router, status]);

  useEffect(() => {
    if (!mode || mode.format !== "section") {
      setLoading(false);
      return;
    }

    let active = true;

    const load = async () => {
      setLoading(true);

      try {
        const res = await fetch(`/api/practice-tests?mode=${mode.key}`, {
          cache: "no-store",
        });
        const data = await res.json();

        if (!active) return;

        setQuestions(data.questions ?? []);
        setTimeRemaining((mode.durationMinutes ?? 0) * 60);
        setUsedMockFill(Boolean(data.usesMockFill));
      } catch (error) {
        console.error("Failed to load practice test", error);
        if (!active) return;
        setQuestions([]);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [mode]);

  useEffect(() => {
    if (!started || submitted) return;

    const timer = window.setInterval(() => {
      setTimeRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setSubmitted(true);
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [started, submitted]);

  if (status === "loading" || loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(180deg,#0d1b2a 0%,#060d1e 52%,#020408 100%)",
          color: "rgba(255,255,255,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "DM Sans,sans-serif",
        }}
      >
        preparing your timed test...
      </div>
    );
  }

  if (!mode || mode.format !== "section") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(180deg,#0d1b2a 0%,#060d1e 52%,#020408 100%)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "DM Sans,sans-serif",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: "520px", textAlign: "center" }}>
          <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "34px", marginBottom: "10px" }}>
            full test runner next
          </div>
          <div style={{ color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: "1.25rem" }}>
            Phase 3B starts with section tests. Full ACT orchestration is the next layer once the section runner is fully tuned.
          </div>
          <button
            onClick={() => router.push("/practice-tests")}
            style={{
              padding: "12px 18px",
              borderRadius: "12px",
              border: "none",
              background: "#1D9E75",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            back to practice tests
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const answeredCount = Object.values(selectedAnswers).filter(Boolean).length;
  const correctCount = submitted
    ? questions.filter((question, index) => selectedAnswers[index] === question.correct_answer).length
    : 0;
  const flaggedCount = flagged.length;
  const remainingCount = questions.length - answeredCount;
  const accuracyPct = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;
  const estimatedSectionScore = submitted
    ? Math.max(1, Math.min(36, Math.round((correctCount / Math.max(questions.length, 1)) * 36)))
    : null;

  const topMeta = mode as PracticeTestMode & { sectionKey: PracticeTestSectionKey };

  if (!started) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background:
            "radial-gradient(circle at 15% 18%, rgba(38, 95, 143, 0.2), transparent 24%), radial-gradient(circle at 76% 20%, rgba(29, 158, 117, 0.14), transparent 22%), linear-gradient(180deg,#0d1b2a 0%,#060d1e 52%,#020408 100%)",
          color: "#fff",
          fontFamily: "DM Sans,sans-serif",
          padding: "1.5rem",
        }}
      >
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <div style={{ maxWidth: "920px", margin: "0 auto" }}>
          <nav
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              alignItems: "center",
              gap: "1rem",
              marginBottom: "2.25rem",
            }}
          >
            <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "22px", justifySelf: "start" }}>
              Aced<em style={{ color: "#1D9E75" }}>.</em>
            </div>
            <div style={{ display: "flex", gap: "2.8rem", justifySelf: "center" }}>
              <button
                onClick={() => router.push("/dashboard")}
                style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.58)", fontSize: "16px", cursor: "pointer" }}
              >
                your universe
              </button>
              <button style={{ background: "transparent", border: "none", color: "#fff", fontSize: "16px", cursor: "default" }}>
                practice tests
              </button>
            </div>
            <div style={{ justifySelf: "end", color: "rgba(255,255,255,0.3)", fontSize: "12px" }}>
              {mode.title}
            </div>
          </nav>

          <div style={{ maxWidth: "720px", marginBottom: "1.5rem" }}>
            <div style={{ fontSize: "11px", letterSpacing: ".08em", textTransform: "uppercase", color: topMeta.accentColor, marginBottom: "10px" }}>
              {topMeta.shortLabel} · {topMeta.constellation}
            </div>
            <h1 style={{ fontFamily: "DM Serif Display,serif", fontWeight: 400, fontSize: "clamp(2rem,4.4vw,3.8rem)", lineHeight: 1.04, marginBottom: "10px" }}>
              ready for the
              <br />
              <em style={{ color: topMeta.accentColor }}>{topMeta.shortLabel} test</em>?
            </h1>
            <p style={{ fontSize: "15px", lineHeight: 1.75, color: "rgba(255,255,255,0.56)" }}>
              Official ACT timing, no instant answer feedback, and a full section score summary at the end. This is rehearsal mode.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "12px", marginBottom: "1.25rem" }}>
            {[
              { value: questions.length, label: "questions" },
              { value: formatDurationLabel(mode.durationMinutes), label: "timer" },
              { value: mode.includesDesmos ? "calculator next" : "focus mode", label: "tools" },
              { value: usedMockFill ? "mixed bank" : "live bank", label: "question set" },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  borderRadius: "16px",
                  padding: "1rem",
                  background: "rgba(255,255,255,0.035)",
                  border: "0.5px solid rgba(255,255,255,0.08)",
                }}
              >
                <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "28px", color: topMeta.accentColor, marginBottom: "4px" }}>
                  {item.value}
                </div>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.34)" }}>{item.label}</div>
              </div>
            ))}
          </div>

          <div
            style={{
              fontSize: "13px",
              lineHeight: 1.7,
              color: "rgba(255,255,255,0.58)",
              background: "rgba(255,255,255,0.035)",
              borderRadius: "16px",
              padding: "1rem 1.05rem",
              borderLeft: `2px solid ${topMeta.accentColor}`,
              marginBottom: "1.25rem",
            }}
          >
            You can move between questions, flag any you want to revisit, and submit early if you're done. When the timer hits zero,
            Aced will auto-submit the section.
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={() => router.push("/practice-tests")}
              style={{
                flex: 1,
                padding: "12px 14px",
                borderRadius: "12px",
                border: "0.5px solid rgba(255,255,255,0.12)",
                background: "transparent",
                color: "rgba(255,255,255,0.72)",
                cursor: "pointer",
              }}
            >
              back
            </button>
            <button
              onClick={() => {
                setStarted(true);
                setTimeRemaining(mode.durationMinutes * 60);
              }}
              style={{
                flex: 1.6,
                padding: "12px 14px",
                borderRadius: "12px",
                border: "none",
                background: topMeta.accentColor,
                color: "#081018",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              start timed section →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg,#0d1b2a 0%,#060d1e 56%,#020408 100%)",
        color: "#fff",
        fontFamily: "DM Sans,sans-serif",
        padding: "1.5rem",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500&display=swap"
        rel="stylesheet"
      />
      <div style={{ maxWidth: "1240px", margin: "0 auto" }}>
        <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
          <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "22px" }}>
            Aced<em style={{ color: "#1D9E75" }}>.</em>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.34)" }}>{mode.title}</span>
            <div
              style={{
                padding: "8px 14px",
                borderRadius: "999px",
                background: submitted ? "rgba(255,255,255,0.08)" : `${topMeta.accentColor}1c`,
                border: `0.5px solid ${submitted ? "rgba(255,255,255,0.12)" : `${topMeta.accentColor}55`}`,
                color: submitted ? "rgba(255,255,255,0.72)" : topMeta.accentColor,
                fontWeight: 600,
                minWidth: "94px",
                textAlign: "center",
              }}
            >
              {submitted ? "submitted" : formatCountdown(timeRemaining)}
            </div>
            {!submitted && (
              <button
                onClick={() => setSubmitted(true)}
                style={{
                  padding: "8px 14px",
                  borderRadius: "999px",
                  border: "0.5px solid rgba(255,255,255,0.12)",
                  background: "transparent",
                  color: "rgba(255,255,255,0.7)",
                  cursor: "pointer",
                }}
              >
                submit section
              </button>
            )}
          </div>
        </nav>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) 320px", gap: "18px", alignItems: "start" }}>
          <div>
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", gap: "10px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.36)" }}>
                  question {currentIndex + 1} of {questions.length}
                </span>
                <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>
                  {answeredCount} answered · {flaggedCount} flagged · {remainingCount} remaining
                </span>
              </div>
              <div style={{ height: "4px", borderRadius: "999px", background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${((currentIndex + 1) / Math.max(questions.length, 1)) * 100}%`,
                    background: topMeta.accentColor,
                    borderRadius: "999px",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "0.9rem" }}>
              <span style={{ fontSize: "10px", padding: "4px 10px", borderRadius: "999px", background: `${topMeta.accentColor}16`, border: `0.5px solid ${topMeta.accentColor}44`, color: topMeta.accentColor }}>
                {topMeta.shortLabel} · {topMeta.constellation}
              </span>
              <span style={{ fontSize: "10px", padding: "4px 10px", borderRadius: "999px", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.52)" }}>
                {currentQuestion.topic}
              </span>
              <span style={{ fontSize: "10px", padding: "4px 10px", borderRadius: "999px", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.52)" }}>
                {currentQuestion.difficulty}
              </span>
            </div>

            {currentQuestion.passage && (
              <div style={{ marginBottom: "1.15rem" }}>
                <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.38)", letterSpacing: ".06em", marginBottom: "8px" }}>
                  PASSAGE / SETUP
                </div>
                <div style={{ fontSize: "15px", lineHeight: 1.85, color: "rgba(255,255,255,0.84)", maxWidth: "800px" }}>
                  {renderFormattedText(currentQuestion.passage)}
                </div>
                <div style={{ height: "1px", background: "linear-gradient(90deg, rgba(255,255,255,0.18), rgba(255,255,255,0))", marginTop: "16px" }} />
              </div>
            )}

            <div style={{ marginBottom: "1.25rem" }}>
              <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: ".08em", color: topMeta.accentColor, marginBottom: "10px", textTransform: "uppercase" }}>
                Question
              </div>
              <div
                style={{
                  fontFamily: "DM Serif Display,serif",
                  fontSize: "clamp(1.22rem, 2vw, 1.62rem)",
                  lineHeight: 1.66,
                  color: "#fff",
                  maxWidth: "840px",
                }}
              >
                {renderFormattedText(currentQuestion.question_text)}
              </div>
            </div>

            <div style={{ display: "grid", gap: "8px", marginBottom: "1rem" }}>
              {(["A", "B", "C", "D"] as const).map((letter) => {
                const selectedAnswer = selectedAnswers[currentIndex];
                const isPicked = selectedAnswer === letter;
                const isCorrect = currentQuestion.correct_answer === letter;

                let background = "rgba(255,255,255,0.03)";
                let borderColor = "rgba(255,255,255,0.1)";
                let textColor = "rgba(255,255,255,0.82)";

                if (submitted) {
                  if (isCorrect) {
                    background = "rgba(93,202,165,0.1)";
                    borderColor = "#5DCAA5";
                  } else if (isPicked) {
                    background = "rgba(240,153,123,0.1)";
                    borderColor = "#F0997B";
                  }
                } else if (isPicked) {
                  background = "rgba(255,255,255,0.08)";
                  borderColor = "rgba(255,255,255,0.34)";
                }

                return (
                  <button
                    key={letter}
                    onClick={() => {
                      if (submitted) return;
                      setSelectedAnswers((current) => ({ ...current, [currentIndex]: letter }));
                    }}
                    style={{
                      textAlign: "left",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "12px",
                      padding: "12px 14px",
                      borderRadius: "12px",
                      border: `0.5px solid ${borderColor}`,
                      background,
                      color: textColor,
                      cursor: submitted ? "default" : "pointer",
                    }}
                  >
                    <div
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "8px",
                        border: "0.5px solid rgba(255,255,255,0.16)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        color: submitted && isCorrect ? "#5DCAA5" : "rgba(255,255,255,0.76)",
                      }}
                    >
                      {letter}
                    </div>
                    <div style={{ fontSize: "13px", lineHeight: 1.55 }}>
                      {renderFormattedText(currentQuestion.choices[letter])}
                    </div>
                  </button>
                );
              })}
            </div>

            {submitted && (
              <div
                style={{
                  borderRadius: "14px",
                  background: "rgba(255,255,255,0.04)",
                  borderLeft: `2px solid ${topMeta.accentColor}`,
                  padding: "12px 14px",
                  marginBottom: "1rem",
                  fontSize: "13px",
                  lineHeight: 1.7,
                  color: "rgba(255,255,255,0.7)",
                }}
              >
                <div style={{ fontSize: "10px", letterSpacing: ".06em", color: topMeta.accentColor, marginBottom: "4px" }}>
                  answer review
                </div>
                Correct answer: {currentQuestion.correct_answer}. {currentQuestion.explanation}
              </div>
            )}

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                onClick={() => setFlagged((current) => (current.includes(currentIndex) ? current.filter((value) => value !== currentIndex) : [...current, currentIndex]))}
                style={{
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: "0.5px solid rgba(255,255,255,0.12)",
                  background: flagged.includes(currentIndex) ? `${topMeta.accentColor}16` : "transparent",
                  color: flagged.includes(currentIndex) ? topMeta.accentColor : "rgba(255,255,255,0.68)",
                  cursor: "pointer",
                }}
              >
                {flagged.includes(currentIndex) ? "flagged" : "flag for review"}
              </button>
              <button
                onClick={() => setCurrentIndex((current) => Math.max(0, current - 1))}
                disabled={currentIndex === 0}
                style={{
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: "0.5px solid rgba(255,255,255,0.12)",
                  background: "transparent",
                  color: currentIndex === 0 ? "rgba(255,255,255,0.26)" : "rgba(255,255,255,0.7)",
                  cursor: currentIndex === 0 ? "default" : "pointer",
                }}
              >
                previous
              </button>
              <button
                onClick={() => setCurrentIndex((current) => Math.min(questions.length - 1, current + 1))}
                disabled={currentIndex >= questions.length - 1}
                style={{
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: "0.5px solid rgba(255,255,255,0.12)",
                  background: "transparent",
                  color: currentIndex >= questions.length - 1 ? "rgba(255,255,255,0.26)" : "rgba(255,255,255,0.7)",
                  cursor: currentIndex >= questions.length - 1 ? "default" : "pointer",
                }}
              >
                next
              </button>
            </div>
          </div>

          <aside
            style={{
              borderRadius: "18px",
              background: "rgba(255,255,255,0.035)",
              border: "0.5px solid rgba(255,255,255,0.08)",
              padding: "1rem",
              position: "sticky",
              top: "1.25rem",
            }}
          >
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.34)", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: "10px" }}>
              section map
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "8px", marginBottom: "1rem" }}>
              {questions.map((question, index) => {
                const isCurrent = index === currentIndex;
                const isAnswered = Boolean(selectedAnswers[index]);
                const isFlagged = flagged.includes(index);
                return (
                  <button
                    key={question.id}
                    onClick={() => setCurrentIndex(index)}
                    style={{
                      width: "100%",
                      aspectRatio: "1 / 1",
                      borderRadius: "12px",
                      border: isCurrent
                        ? `0.5px solid ${topMeta.accentColor}`
                        : isFlagged
                          ? "0.5px solid rgba(240,153,123,0.7)"
                          : "0.5px solid rgba(255,255,255,0.1)",
                      background: isCurrent
                        ? `${topMeta.accentColor}20`
                        : isAnswered
                          ? "rgba(255,255,255,0.08)"
                          : "rgba(255,255,255,0.03)",
                      color: isCurrent ? topMeta.accentColor : isAnswered ? "#fff" : "rgba(255,255,255,0.45)",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: 600,
                    }}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "grid", gap: "8px", marginBottom: "1rem" }}>
              {[
                { value: answeredCount, label: "answered" },
                { value: flaggedCount, label: "flagged" },
                { value: remainingCount, label: "remaining" },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "12px",
                    color: "rgba(255,255,255,0.6)",
                    padding: "8px 10px",
                    borderRadius: "12px",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <span>{item.label}</span>
                  <span style={{ color: topMeta.accentColor, fontWeight: 600 }}>{item.value}</span>
                </div>
              ))}
            </div>

            {submitted ? (
              <div
                style={{
                  borderRadius: "14px",
                  background: "rgba(255,255,255,0.04)",
                  borderLeft: `2px solid ${topMeta.accentColor}`,
                  padding: "0.95rem 1rem",
                }}
              >
                <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "28px", color: topMeta.accentColor, marginBottom: "4px" }}>
                  {correctCount}/{questions.length}
                </div>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.38)", marginBottom: "10px" }}>raw score</div>
                <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.72)", marginBottom: "6px" }}>
                  accuracy {accuracyPct}% · quick estimate {estimatedSectionScore}/36
                </div>
                <div style={{ fontSize: "12px", lineHeight: 1.7, color: "rgba(255,255,255,0.5)" }}>
                  Detailed scaled scoring and star recovery plans are next in Phase 3B.
                </div>
              </div>
            ) : (
              <div
                style={{
                  borderRadius: "14px",
                  background: "rgba(255,255,255,0.03)",
                  borderLeft: `2px solid ${topMeta.accentColor}`,
                  padding: "0.95rem 1rem",
                  fontSize: "12px",
                  lineHeight: 1.7,
                  color: "rgba(255,255,255,0.52)",
                }}
              >
                No instant answer reveals here. Take it like a real section, then review once you submit or run out of time.
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

export default function PracticeTestRunPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            background: "linear-gradient(180deg,#0d1b2a 0%,#060d1e 52%,#020408 100%)",
            color: "rgba(255,255,255,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "DM Sans,sans-serif",
          }}
        >
          preparing timed runner...
        </div>
      }
    >
      <PracticeTestRunContent />
    </Suspense>
  );
}
