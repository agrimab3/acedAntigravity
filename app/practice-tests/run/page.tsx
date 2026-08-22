"use client";

import { Fragment, Suspense, useEffect, useEffectEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  getPracticeTestMode,
  type PracticeTestMode,
  type PracticeTestSectionKey,
} from "@/lib/practice-tests";
import {
  estimatePracticeTestCompositeScore,
  estimatePracticeTestSectionScore,
  summarizeCompositePacing,
  summarizePracticeTestPacing,
} from "@/lib/practice-test-score";
import {
  buildPracticeTestRemediationPlan,
  type PracticeTestRemediationPlan,
} from "@/lib/practice-test-remediation";
import { useOnboardingState } from "@/lib/use-onboarding-state";

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

type RunnerSection = {
  sectionRunId: string | null;
  sectionKey: PracticeTestSectionKey;
  title: string;
  questionCount: number;
  durationMinutes: number;
  questions: TestQuestion[];
  usesMockFill: boolean;
  availableCount: number;
};

type CompletionReport = {
  persisted: boolean;
  sessionId: string | null;
  modeKey: string;
  format: "section" | "full";
  totalQuestionCount: number;
  answeredCount: number;
  correctCount: number;
  accuracyPct: number;
  compositeEstimatedScore: number | null;
  sectionReports: Array<{
    sectionRunId: string;
    sectionKey: string;
    title: string;
    questionCount: number;
    answeredCount: number;
    correctCount: number;
    accuracyPct: number;
    estimatedScore: number;
    timeLimitSeconds?: number;
    durationSeconds: number;
    pacingSummary?: {
      label: string;
      tone: "ahead" | "steady" | "behind";
      avgSecondsPerAnswered: number;
      targetSecondsPerQuestion: number;
      paceDeltaSeconds: number;
      description: string;
    };
  }>;
  overallPacing?: {
    label: string;
    tone: "ahead" | "steady" | "behind";
    description: string;
  };
  remediationPlan: PracticeTestRemediationPlan;
  missedAnalysis: Array<{
    sectionKey: string;
    topicName: string;
    misses: number;
  }>;
  missedQuestions: Array<{
    sectionKey: string;
    sectionTitle: string;
    questionOrder: number;
    topicName: string;
    selectedAnswer: string | null;
    correctAnswer: string;
    flagged?: boolean;
    question: TestQuestion;
  }>;
};

type RunnerPhase = "intro" | "running" | "section-break" | "report";

type RunnerLoadError = {
  message: string;
  detail?: string;
};

type SectionAdvanceReason = "manual" | "timeout";

type SectionTransitionState = {
  completedSectionTitle: string;
  nextSectionTitle: string | null;
  reason: SectionAdvanceReason;
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

function keyFor(sectionIndex: number, questionIndex: number) {
  return `${sectionIndex}:${questionIndex}`;
}

function isAnswerChoice(value: unknown): value is "A" | "B" | "C" | "D" {
  return value === "A" || value === "B" || value === "C" || value === "D";
}

function normalizeTestQuestion(value: unknown): TestQuestion | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const question = value as Record<string, unknown>;
  const choices = question.choices as Record<string, unknown> | undefined;

  if (
    typeof question.id !== "string" ||
    typeof question.section !== "string" ||
    typeof question.topic !== "string" ||
    typeof question.difficulty !== "string" ||
    (question.passage !== undefined && question.passage !== null && typeof question.passage !== "string") ||
    typeof question.question_text !== "string" ||
    !choices ||
    typeof choices.A !== "string" ||
    typeof choices.B !== "string" ||
    typeof choices.C !== "string" ||
    typeof choices.D !== "string" ||
    !isAnswerChoice(question.correct_answer) ||
    typeof question.explanation !== "string"
  ) {
    return null;
  }

  return {
    id: question.id,
    section: question.section,
    topic: question.topic,
    difficulty: question.difficulty,
    passage: typeof question.passage === "string" ? question.passage : null,
    question_text: question.question_text,
    choices: {
      A: choices.A,
      B: choices.B,
      C: choices.C,
      D: choices.D,
    },
    correct_answer: question.correct_answer,
    explanation: question.explanation,
  };
}

function isSectionKey(value: unknown): value is PracticeTestSectionKey {
  return value === "english" || value === "math" || value === "reading" || value === "science";
}

function normalizeRunnerSection(value: unknown): RunnerSection | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const section = value as Record<string, unknown>;
  const questions = Array.isArray(section.questions)
    ? section.questions
        .map((question) => normalizeTestQuestion(question))
        .filter((question): question is TestQuestion => Boolean(question))
    : [];

  if (
    !(
      (section.sectionRunId === undefined ||
        section.sectionRunId === null ||
        typeof section.sectionRunId === "string") &&
      isSectionKey(section.sectionKey) &&
      typeof section.title === "string" &&
      typeof section.questionCount === "number" &&
      typeof section.durationMinutes === "number" &&
      typeof section.usesMockFill === "boolean" &&
      typeof section.availableCount === "number"
    )
  ) {
    return null;
  }

  return {
    sectionRunId: typeof section.sectionRunId === "string" ? section.sectionRunId : null,
    sectionKey: section.sectionKey,
    title: section.title,
    questionCount: section.questionCount,
    durationMinutes: section.durationMinutes,
    questions,
    usesMockFill: section.usesMockFill,
    availableCount: section.availableCount,
  };
}

function parseApiErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const error = (payload as Record<string, unknown>).error;
  return typeof error === "string" && error.trim().length > 0 ? error : null;
}

function FlagIcon({
  filled,
  color,
  size = 16,
}: {
  filled: boolean;
  color: string;
  size?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      style={{ flexShrink: 0, display: "block" }}
    >
      <path
        d="M4 1.75v12.5M4.5 2.5h6.25l-1.35 2.55L10.75 7.5H4.5"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? color : "none"}
        opacity={filled ? 0.95 : 1}
      />
    </svg>
  );
}

function QuestionMapDrawer({
  open,
  section,
  currentQuestionIndex,
  selectedAnswers,
  flaggedKeys,
  sectionIndex,
  accentColor,
  onClose,
  onQuestionSelect,
}: {
  open: boolean;
  section: RunnerSection | null;
  currentQuestionIndex: number;
  selectedAnswers: Record<string, "A" | "B" | "C" | "D" | null>;
  flaggedKeys: string[];
  sectionIndex: number;
  accentColor: string;
  onClose: () => void;
  onQuestionSelect: (questionIndex: number) => void;
}) {
  if (!open || !section) {
    return null;
  }

  const answeredCount = section.questions.filter(
    (_, questionIndex) => selectedAnswers[keyFor(sectionIndex, questionIndex)] !== null
  ).length;
  const flaggedCount = section.questions.filter((_, questionIndex) =>
    flaggedKeys.includes(keyFor(sectionIndex, questionIndex))
  ).length;
  const unansweredCount = Math.max(0, section.questions.length - answeredCount);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(2, 6, 12, 0.62)",
          backdropFilter: "blur(10px)",
          zIndex: 40,
        }}
      />
      <aside
        className="question-map-drawer"
        style={{
          position: "fixed",
          right: 0,
          top: 0,
          bottom: 0,
          width: "min(420px, 100vw)",
          padding: "1.2rem",
          background:
            "linear-gradient(180deg, rgba(9, 24, 37, 0.98) 0%, rgba(5, 13, 22, 0.98) 100%)",
          borderLeft: "0.5px solid rgba(255,255,255,0.1)",
          boxShadow: "-18px 0 60px rgba(0,0,0,0.35)",
          zIndex: 41,
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start", marginBottom: "1rem" }}>
          <div>
            <div style={{ fontSize: "11px", color: accentColor, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: "6px" }}>
              Questions
            </div>
            <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "28px", color: "#fff" }}>{section.title}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "999px",
              border: "0.5px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.72)",
              cursor: "pointer",
              fontSize: "18px",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px", marginBottom: "1rem" }}>
          {[
            { label: "answered", value: answeredCount },
            { label: "flagged", value: flaggedCount },
            { label: "unanswered", value: unansweredCount },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                borderRadius: "14px",
                padding: "0.9rem 0.85rem",
                background: "rgba(255,255,255,0.04)",
                border: "0.5px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "22px", color: "#fff", marginBottom: "4px" }}>{item.value}</div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.42)" }}>{item.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(52px, 1fr))", gap: "10px" }}>
          {section.questions.map((question, questionIndex) => {
            const answerKey = keyFor(sectionIndex, questionIndex);
            const isCurrent = questionIndex === currentQuestionIndex;
            const isAnswered = selectedAnswers[answerKey] !== null;
            const isFlagged = flaggedKeys.includes(answerKey);

            return (
              <button
                key={`${question.id}-${questionIndex}`}
                type="button"
                onClick={() => {
                  onQuestionSelect(questionIndex);
                  onClose();
                }}
                style={{
                  position: "relative",
                  minHeight: "52px",
                  borderRadius: "14px",
                  border: isCurrent
                    ? `0.5px solid ${accentColor}`
                    : isFlagged
                      ? "0.5px solid rgba(84, 211, 191, 0.44)"
                      : "0.5px solid rgba(255,255,255,0.08)",
                  background: isCurrent
                    ? `${accentColor}22`
                    : isAnswered
                      ? "rgba(255,255,255,0.1)"
                      : "rgba(255,255,255,0.035)",
                  color: isCurrent ? accentColor : isAnswered ? "#fff" : "rgba(255,255,255,0.62)",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                {questionIndex + 1}
                {isFlagged ? (
                  <span style={{ position: "absolute", top: "6px", right: "6px" }}>
                    <FlagIcon filled color={accentColor} size={12} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
}

function SubmitSectionModal({
  open,
  sectionTitle,
  unansweredCount,
  flaggedCount,
  accentColor,
  onReviewQuestions,
  onConfirmSubmit,
}: {
  open: boolean;
  sectionTitle: string;
  unansweredCount: number;
  flaggedCount: number;
  accentColor: string;
  onReviewQuestions: () => void;
  onConfirmSubmit: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(2, 6, 12, 0.68)",
          backdropFilter: "blur(10px)",
          zIndex: 50,
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
          zIndex: 51,
        }}
      >
        <div style={{ fontSize: "11px", color: accentColor, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: "8px" }}>
          Submit Section
        </div>
        <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "32px", lineHeight: 1.1, color: "#fff", marginBottom: "10px" }}>
          Ready to submit {sectionTitle}?
        </div>
        <div style={{ color: "rgba(255,255,255,0.68)", lineHeight: 1.7, fontSize: "14px", marginBottom: "1rem" }}>
          You still have unresolved questions in this section. Review them now or submit anyway.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px", marginBottom: "1.1rem" }}>
          {[
            { label: "unanswered", value: unansweredCount },
            { label: "flagged for review", value: flaggedCount },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                borderRadius: "14px",
                padding: "0.95rem",
                background: "rgba(255,255,255,0.05)",
                border: "0.5px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "24px", color: "#fff", marginBottom: "4px" }}>{item.value}</div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.44)" }}>{item.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onReviewQuestions}
            style={{
              flex: 1,
              minWidth: "180px",
              padding: "12px 14px",
              borderRadius: "12px",
              border: "0.5px solid rgba(255,255,255,0.12)",
              background: "transparent",
              color: "rgba(255,255,255,0.8)",
              cursor: "pointer",
            }}
          >
            review questions
          </button>
          <button
            type="button"
            onClick={onConfirmSubmit}
            style={{
              flex: 1,
              minWidth: "180px",
              padding: "12px 14px",
              borderRadius: "12px",
              border: "none",
              background: accentColor,
              color: "#081018",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            submit section anyway
          </button>
        </div>
      </div>
    </>
  );
}

function ReportSectionCard({
  section,
  accentColor,
}: {
  section: CompletionReport["sectionReports"][number];
  accentColor: string;
}) {
  return (
    <div
      style={{
        borderRadius: "18px",
        background: "rgba(255,255,255,0.055)",
        border: "0.5px solid rgba(255,255,255,0.1)",
        padding: "1rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "baseline", marginBottom: "10px" }}>
        <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "24px", color: "#fff" }}>{section.title}</div>
        <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "28px", color: accentColor }}>{section.estimatedScore}/36</div>
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
        {[
          `${section.correctCount}/${section.questionCount} correct`,
          `${section.accuracyPct}% accuracy`,
          formatCountdown(section.durationSeconds),
        ].map((value) => (
          <span
            key={value}
            style={{
              fontSize: "11px",
              color: "rgba(255,255,255,0.68)",
              background: "rgba(255,255,255,0.05)",
              borderRadius: "999px",
              padding: "5px 8px",
            }}
          >
            {value}
          </span>
        ))}
      </div>
      <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.52)", lineHeight: 1.6 }}>
        {section.pacingSummary
          ? `${section.pacingSummary.label} · ${section.pacingSummary.description}`
          : "Pacing data will appear here once the section is complete."}
      </div>
    </div>
  );
}

function PracticeTestRunContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const { loading: onboardingLoading } = useOnboardingState(status, {
    redirectIfIncomplete: "/onboarding",
  });
  const modeKey = searchParams.get("mode");
  const mode = useMemo(
    () => getPracticeTestMode(modeKey),
    [modeKey]
  );

  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<RunnerPhase>("intro");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [persistedSession, setPersistedSession] = useState(false);
  const [sections, setSections] = useState<RunnerSection[]>([]);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [currentQuestionIndices, setCurrentQuestionIndices] = useState<Record<number, number>>({});
  const [selectedAnswers, setSelectedAnswers] = useState<
    Record<string, "A" | "B" | "C" | "D" | null>
  >({});
  const [flaggedKeys, setFlaggedKeys] = useState<string[]>([]);
  const [timeRemainingBySection, setTimeRemainingBySection] = useState<Record<number, number>>({});
  const [timeSpentByQuestion, setTimeSpentByQuestion] = useState<Record<string, number>>({});
  const [questionStartedAtMs, setQuestionStartedAtMs] = useState<number | null>(null);
  const [showCalculator, setShowCalculator] = useState(false);
  const [report, setReport] = useState<CompletionReport | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<RunnerLoadError | null>(null);
  const [questionMapOpen, setQuestionMapOpen] = useState(false);
  const [submitWarningOpen, setSubmitWarningOpen] = useState(false);
  const [transitionState, setTransitionState] = useState<SectionTransitionState | null>(null);
  const [timeWarningMessage, setTimeWarningMessage] = useState<string | null>(null);
  const [shownTimeWarnings, setShownTimeWarnings] = useState<string[]>([]);
  const [showQuestionReview, setShowQuestionReview] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [router, status]);

  useEffect(() => {
    if (!mode) {
      setLoading(false);
      return;
    }

    let active = true;

    const createSession = async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const res = await fetch("/api/practice-tests/session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ mode: mode.key }),
        });

        const raw = await res.text();
        const data = raw ? (JSON.parse(raw) as unknown) : null;
        const payload =
          data && typeof data === "object" ? (data as Record<string, unknown>) : null;

        if (!res.ok) {
          const detail = parseApiErrorMessage(data) ?? `Session API returned ${res.status}.`;
          throw new Error(detail);
        }

        if (!active) return;

        const nextSections = Array.isArray(payload?.sections)
          ? payload.sections
              .map((section) => normalizeRunnerSection(section))
              .filter((section): section is RunnerSection => Boolean(section))
          : [];

        if (nextSections.length === 0) {
          throw new Error("Session API returned no runnable sections.");
        }

        if (nextSections.some((section) => section.questions.length === 0)) {
          throw new Error("Session API returned an empty section.");
        }

        setSessionId(typeof payload?.sessionId === "string" ? payload.sessionId : null);
        setPersistedSession(Boolean(payload?.persisted));
        setSections(nextSections);
        setCurrentSectionIndex(0);
        setCurrentQuestionIndices(
          Object.fromEntries(nextSections.map((_, index) => [index, 0]))
        );
        setTimeRemainingBySection(
          Object.fromEntries(
            nextSections.map((section, index) => [index, section.durationMinutes * 60])
          )
        );
        setSelectedAnswers({});
        setFlaggedKeys([]);
        setTimeSpentByQuestion({});
        setQuestionStartedAtMs(null);
        setShowCalculator(false);
        setQuestionMapOpen(false);
        setSubmitWarningOpen(false);
        setTransitionState(null);
        setTimeWarningMessage(null);
        setShownTimeWarnings([]);
        setShowQuestionReview(false);
        setPhase("intro");
        setReport(null);
      } catch (error) {
        console.error("Failed to create practice test session", error);
        if (!active) return;
        setLoadError({
          message: "Unable to load this practice test. Try again.",
          detail: error instanceof Error ? error.message : "Unknown runner initialization error.",
        });
        setSections([]);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void createSession();

    return () => {
      active = false;
    };
  }, [mode]);

  const currentSection = sections[currentSectionIndex] ?? null;
  const currentQuestionIndex = currentQuestionIndices[currentSectionIndex] ?? 0;
  const currentQuestion = currentSection?.questions[currentQuestionIndex] ?? null;
  const currentQuestionKey = currentSection ? keyFor(currentSectionIndex, currentQuestionIndex) : null;
  const totalQuestionCount = sections.reduce((sum, section) => sum + section.questions.length, 0);
  const answeredCount = Object.values(selectedAnswers).filter((value) => value !== null).length;
  const currentAnsweredCount = currentSection
    ? currentSection.questions.filter(
        (_, questionIndex) => selectedAnswers[keyFor(currentSectionIndex, questionIndex)] !== null
      ).length
    : 0;
  const currentFlaggedCount = currentSection
    ? currentSection.questions.filter((_, questionIndex) =>
        flaggedKeys.includes(keyFor(currentSectionIndex, questionIndex))
      ).length
    : 0;
  const currentRemainingCount = currentSection
    ? Math.max(0, currentSection.questions.length - currentAnsweredCount)
    : 0;
  const currentTimeRemaining = timeRemainingBySection[currentSectionIndex] ?? 0;
  const flaggedQuestionIndices = currentSection
    ? currentSection.questions
        .map((_, index) => ({
          index,
          key: keyFor(currentSectionIndex, index),
        }))
        .filter((entry) => flaggedKeys.includes(entry.key))
        .map((entry) => entry.index)
    : [];
  const unresolvedQuestionIndices = currentSection
    ? currentSection.questions
        .map((_, index) => index)
        .filter((index) => {
          const answerKey = keyFor(currentSectionIndex, index);
          return selectedAnswers[answerKey] === null || flaggedKeys.includes(answerKey);
        })
    : [];
  const handleSectionAdvanceEvent = useEffectEvent(() => {
    void handleSectionAdvance("timeout", true);
  });
  const allSectionScores = sections.map((section, sectionIndex) => {
    const correctCount = section.questions.filter(
      (question, questionIndex) =>
        selectedAnswers[keyFor(sectionIndex, questionIndex)] === question.correct_answer
    ).length;

    return {
      sectionKey: section.sectionKey,
      correctCount,
      answeredCount: section.questions.filter(
        (_, questionIndex) => selectedAnswers[keyFor(sectionIndex, questionIndex)] !== null
      ).length,
      accuracyPct:
        section.questions.length > 0
          ? Math.round((correctCount / section.questions.length) * 100)
          : 0,
      estimatedScore: estimatePracticeTestSectionScore(
        section.sectionKey,
        correctCount,
        section.questions.length
      ),
    };
  });

  function flushCurrentQuestionTime() {
    if (phase !== "running" || !currentQuestionKey || questionStartedAtMs === null) {
      return;
    }

    const elapsed = Math.max(0, Math.round((Date.now() - questionStartedAtMs) / 1000));

    if (elapsed > 0) {
      setTimeSpentByQuestion((current) => ({
        ...current,
        [currentQuestionKey]: (current[currentQuestionKey] ?? 0) + elapsed,
      }));
    }

    setQuestionStartedAtMs(Date.now());
  }

  useEffect(() => {
    if (phase !== "running") return;

    const timer = window.setInterval(() => {
      setTimeRemainingBySection((current) => {
        const nextRemaining = Math.max(0, (current[currentSectionIndex] ?? 0) - 1);
        return {
          ...current,
          [currentSectionIndex]: nextRemaining,
        };
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [currentSectionIndex, phase]);

  useEffect(() => {
    if (phase === "running" && currentTimeRemaining === 0 && sections.length > 0) {
      handleSectionAdvanceEvent();
    }
  }, [currentTimeRemaining, phase, sections.length]);

  useEffect(() => {
    if (phase !== "running" || !currentSection) {
      return;
    }

    const nextThreshold =
      currentTimeRemaining <= 60
        ? 60
        : currentTimeRemaining <= 300
          ? 300
          : null;

    if (!nextThreshold) {
      return;
    }

    const warningKey = `${currentSectionIndex}:${nextThreshold}`;
    if (shownTimeWarnings.includes(warningKey)) {
      return;
    }

    setShownTimeWarnings((current) => [...current, warningKey]);
    setTimeWarningMessage(
      nextThreshold === 60
        ? `1 minute remaining in ${currentSection.title}.`
        : `5 minutes remaining in ${currentSection.title}.`
    );
  }, [currentSection, currentSectionIndex, currentTimeRemaining, phase, shownTimeWarnings]);

  useEffect(() => {
    if (!timeWarningMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setTimeWarningMessage(null);
    }, 3600);

    return () => window.clearTimeout(timeoutId);
  }, [timeWarningMessage]);

  async function handleFinalizeTest() {
    if (!mode) return;

    flushCurrentQuestionTime();
    setSubmitting(true);

    const payloadSections = sections.map((section, sectionIndex) => ({
      sectionRunId: section.sectionRunId ?? `section-${sectionIndex}`,
      sectionKey: section.sectionKey,
      durationSeconds: section.durationMinutes * 60 - (timeRemainingBySection[sectionIndex] ?? 0),
      answers: section.questions.map((_, questionIndex) => {
        const answerKey = keyFor(sectionIndex, questionIndex);
        return {
          questionOrder: questionIndex,
          selectedAnswer: selectedAnswers[answerKey] ?? null,
          flagged: flaggedKeys.includes(answerKey),
          timeSpentSeconds: timeSpentByQuestion[answerKey] ?? 0,
        };
      }),
    }));

    const localReport: CompletionReport = {
      persisted: false,
      sessionId,
      modeKey: mode.key,
      format: mode.format,
      totalQuestionCount,
      answeredCount,
      correctCount: allSectionScores.reduce((sum, section) => sum + section.correctCount, 0),
      accuracyPct:
        totalQuestionCount > 0
          ? Math.round(
              (allSectionScores.reduce((sum, section) => sum + section.correctCount, 0) /
                totalQuestionCount) *
                100
            )
          : 0,
      compositeEstimatedScore: estimatePracticeTestCompositeScore(
        allSectionScores.map((section) => section.estimatedScore)
      ),
      sectionReports: sections.map((section, sectionIndex) => {
        const durationSeconds =
          section.durationMinutes * 60 - (timeRemainingBySection[sectionIndex] ?? 0);
        return {
          sectionRunId: section.sectionRunId ?? `section-${sectionIndex}`,
          sectionKey: section.sectionKey,
          title: section.title,
          questionCount: section.questions.length,
          answeredCount: allSectionScores[sectionIndex]?.answeredCount ?? 0,
          correctCount: allSectionScores[sectionIndex]?.correctCount ?? 0,
          accuracyPct: allSectionScores[sectionIndex]?.accuracyPct ?? 0,
          estimatedScore: allSectionScores[sectionIndex]?.estimatedScore ?? 1,
          timeLimitSeconds: section.durationMinutes * 60,
          durationSeconds,
          pacingSummary: summarizePracticeTestPacing({
            sectionKey: section.sectionKey,
            questionCount: section.questions.length,
            answeredCount: allSectionScores[sectionIndex]?.answeredCount ?? 0,
            durationSeconds,
            timeLimitSeconds: section.durationMinutes * 60,
          }),
        };
      }),
      overallPacing: summarizeCompositePacing(
        sections.map((section, sectionIndex) =>
          summarizePracticeTestPacing({
            sectionKey: section.sectionKey,
            questionCount: section.questions.length,
            answeredCount: allSectionScores[sectionIndex]?.answeredCount ?? 0,
            durationSeconds:
              section.durationMinutes * 60 - (timeRemainingBySection[sectionIndex] ?? 0),
            timeLimitSeconds: section.durationMinutes * 60,
          })
        )
      ),
      remediationPlan: buildPracticeTestRemediationPlan({
        topicSignals: [],
        sectionSignals: [],
      }),
      missedAnalysis: [],
      missedQuestions: sections.flatMap((section, sectionIndex) =>
        section.questions
          .map((question, questionIndex) => {
            const answerKey = keyFor(sectionIndex, questionIndex);
            const selectedAnswer = selectedAnswers[answerKey] ?? null;
            if (selectedAnswer === null || selectedAnswer === question.correct_answer) {
              return null;
            }

            return {
              sectionKey: section.sectionKey,
              sectionTitle: section.title,
              questionOrder: questionIndex,
              topicName: question.topic,
              selectedAnswer,
              correctAnswer: question.correct_answer,
              flagged: flaggedKeys.includes(answerKey),
              question,
            };
          })
          .filter(Boolean)
      ) as CompletionReport["missedQuestions"],
    };

    localReport.missedAnalysis = Array.from(
      localReport.missedQuestions.reduce((map, question) => {
        const existing = map.get(`${question.sectionKey}:${question.topicName}`) ?? {
          sectionKey: question.sectionKey,
          topicName: question.topicName,
          misses: 0,
        };
        existing.misses += 1;
        map.set(`${question.sectionKey}:${question.topicName}`, existing);
        return map;
      }, new Map<string, { sectionKey: string; topicName: string; misses: number }>())
    )
      .map(([, value]) => value)
      .sort((a, b) => b.misses - a.misses);

    localReport.remediationPlan = buildPracticeTestRemediationPlan({
      topicSignals: Array.from(
        sections.reduce((map, section, sectionIndex) => {
          section.questions.forEach((question, questionIndex) => {
            const answerKey = keyFor(sectionIndex, questionIndex);
            const selectedAnswer = selectedAnswers[answerKey] ?? null;
            const signalKey = `${section.sectionKey}:${question.topic}`;
            const current = map.get(signalKey) ?? {
              sectionKey: section.sectionKey,
              sectionTitle: section.title,
              topicName: question.topic,
              misses: 0,
              attempts: 0,
              unansweredCount: 0,
              flaggedCount: 0,
            };

            if (selectedAnswer === null) {
              current.unansweredCount += 1;
            } else {
              current.attempts += 1;
              if (selectedAnswer !== question.correct_answer) {
                current.misses += 1;
              }
            }

            if (flaggedKeys.includes(answerKey)) {
              current.flaggedCount += 1;
            }

            map.set(signalKey, current);
          });

          return map;
        }, new Map<string, {
          sectionKey: PracticeTestSectionKey;
          sectionTitle: string;
          topicName: string;
          misses: number;
          attempts: number;
          unansweredCount: number;
          flaggedCount: number;
        }>())
      ).map(([, value]) => value),
      sectionSignals: sections.map((section, sectionIndex) => ({
        sectionKey: section.sectionKey,
        title: section.title,
        accuracyPct: allSectionScores[sectionIndex]?.accuracyPct ?? 0,
        answeredCount: allSectionScores[sectionIndex]?.answeredCount ?? 0,
        questionCount: section.questions.length,
        pacingTone: summarizePracticeTestPacing({
          sectionKey: section.sectionKey,
          questionCount: section.questions.length,
          answeredCount: allSectionScores[sectionIndex]?.answeredCount ?? 0,
          durationSeconds:
            section.durationMinutes * 60 - (timeRemainingBySection[sectionIndex] ?? 0),
          timeLimitSeconds: section.durationMinutes * 60,
        }).tone,
      })),
    });

    if (persistedSession && sessionId) {
      try {
        const res = await fetch(`/api/practice-tests/session/${sessionId}/complete`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            durationSeconds: sections.reduce(
              (sum, section, sectionIndex) =>
                sum + (section.durationMinutes * 60 - (timeRemainingBySection[sectionIndex] ?? 0)),
              0
            ),
            sections: payloadSections,
          }),
        });

        if (res.ok) {
          const data = (await res.json()) as CompletionReport;
          setReport(data);
        } else {
          setReport(localReport);
        }
      } catch (error) {
        console.error("Failed to persist practice test completion", error);
        setReport(localReport);
      }
    } else {
      setReport(localReport);
    }

    setSubmitting(false);
    setPhase("report");
  }

  async function handleSectionAdvance(
    reason: SectionAdvanceReason = "manual",
    forceSubmission = false
  ) {
    if (phase !== "running") {
      return;
    }

    if (!currentSection) {
      return;
    }

    if (
      !forceSubmission &&
      reason === "manual" &&
      (currentRemainingCount > 0 || currentFlaggedCount > 0)
    ) {
      setSubmitWarningOpen(true);
      return;
    }

    flushCurrentQuestionTime();
    setSubmitWarningOpen(false);
    setQuestionMapOpen(false);
    setTimeWarningMessage(null);
    setShowCalculator(false);

    if (currentSectionIndex >= sections.length - 1) {
      await handleFinalizeTest();
      return;
    }

    setTransitionState({
      completedSectionTitle: currentSection.title,
      nextSectionTitle: sections[currentSectionIndex + 1]?.title ?? null,
      reason,
    });
    setPhase("section-break");
  }

  function goToQuestion(questionIndex: number) {
    flushCurrentQuestionTime();
    setCurrentQuestionIndices((current) => ({
      ...current,
      [currentSectionIndex]: questionIndex,
    }));
    setQuestionStartedAtMs(Date.now());
  }

  function toggleFlag() {
    if (!currentQuestionKey) return;

    setFlaggedKeys((current) =>
      current.includes(currentQuestionKey)
        ? current.filter((key) => key !== currentQuestionKey)
        : [...current, currentQuestionKey]
    );
  }

  if (status === "loading" || onboardingLoading || loading) {
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

  if (loadError) {
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
        <div style={{ maxWidth: "560px", textAlign: "center" }}>
          <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "34px", marginBottom: "10px" }}>
            unable to load test
          </div>
          <div style={{ color: "rgba(255,255,255,0.6)", lineHeight: 1.7, marginBottom: "0.75rem" }}>
            {loadError.message}
          </div>
          {loadError.detail ? (
            <div style={{ color: "rgba(255,255,255,0.4)", lineHeight: 1.6, marginBottom: "1.25rem", fontSize: "12px" }}>
              {loadError.detail}
            </div>
          ) : null}
          <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => router.refresh()}
              style={{
                padding: "12px 18px",
                borderRadius: "12px",
                border: "none",
                background: "#1D9E75",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              try again
            </button>
            <button
              onClick={() => router.push("/practice-tests")}
              style={{
                padding: "12px 18px",
                borderRadius: "12px",
                border: "0.5px solid rgba(255,255,255,0.12)",
                background: "transparent",
                color: "rgba(255,255,255,0.78)",
                cursor: "pointer",
              }}
            >
              back to practice tests
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!mode || sections.length === 0) {
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
        <div style={{ maxWidth: "540px", textAlign: "center" }}>
          <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "34px", marginBottom: "10px" }}>
            practice test unavailable
          </div>
          <div style={{ color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: "1.25rem" }}>
            This test mode could not be prepared yet. Try again in a moment or head back to the launcher.
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

  const topMeta = mode as PracticeTestMode;

  if (phase === "intro") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background:
            "radial-gradient(circle at 16% 14%, rgba(61, 192, 182, 0.16), transparent 24%), radial-gradient(circle at 48% 0%, rgba(25, 124, 153, 0.2), transparent 30%), radial-gradient(circle at 78% 18%, rgba(17, 113, 127, 0.14), transparent 22%), linear-gradient(180deg,#0d1b2a 0%,#081726 52%,#020408 100%)",
          color: "#fff",
          fontFamily: "DM Sans,sans-serif",
          padding: "1.5rem",
        }}
      >
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <div style={{ maxWidth: "940px", margin: "0 auto" }}>
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

          <div style={{ maxWidth: "760px", marginBottom: "1.5rem" }}>
            <div style={{ fontSize: "11px", letterSpacing: ".08em", textTransform: "uppercase", color: topMeta.accentColor, marginBottom: "10px" }}>
              {topMeta.shortLabel} · {topMeta.constellation}
            </div>
            <h1 style={{ fontFamily: "DM Serif Display,serif", fontWeight: 400, fontSize: "clamp(2rem,4.4vw,3.8rem)", lineHeight: 1.04, marginBottom: "10px" }}>
              ready for the
              <br />
              <em style={{ color: topMeta.accentColor }}>{topMeta.shortLabel} test</em>?
            </h1>
            <p style={{ fontSize: "15px", lineHeight: 1.75, color: "rgba(255,255,255,0.56)" }}>
              Official ACT timing, real section sequencing, no instant answer feedback, and a full section-by-section score report
              at the end.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "12px", marginBottom: "1.25rem" }}>
            {[
              { value: totalQuestionCount, label: "questions" },
              { value: formatDurationLabel(mode.durationMinutes), label: "timer" },
              { value: mode.includesDesmos ? "calculator" : "focus mode", label: "tools" },
              { value: sections.some((section) => section.usesMockFill) ? "mixed bank" : "live bank", label: "question set" },
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
              color: "rgba(255,255,255,0.74)",
              background: "rgba(255,255,255,0.05)",
              borderRadius: "16px",
              padding: "1.05rem 1.1rem",
              borderLeft: `2px solid ${topMeta.accentColor}`,
              border: "0.5px solid rgba(255,255,255,0.08)",
              marginBottom: "1.25rem",
            }}
          >
            Aced will save this test in the database, score each finished section, and map missed questions back to the skill
            stars you should rebuild next.
          </div>

          <div style={{ display: "grid", gap: "8px", marginBottom: "1.25rem" }}>
            {sections.map((section, index) => (
              <div
                key={`${section.sectionKey}-${index}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  padding: "12px 14px",
                  borderRadius: "12px",
                  background: "rgba(255,255,255,0.05)",
                  border: "0.5px solid rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.74)",
                  fontSize: "13px",
                  alignItems: "center",
                }}
              >
                <span style={{ fontWeight: 600, color: "#f5f7fa" }}>
                  {index + 1}. {section.title}
                </span>
                <span style={{ color: "rgba(255,255,255,0.68)" }}>
                  {section.questionCount}q · {section.durationMinutes}m
                </span>
              </div>
            ))}
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
                setPhase("running");
                setQuestionStartedAtMs(Date.now());
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
              start timed test →
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "section-break") {
    const nextSection = sections[currentSectionIndex + 1];
    const completedSectionTitle = transitionState?.completedSectionTitle ?? sections[currentSectionIndex]?.title ?? "Section";
    const nextSectionTitle = transitionState?.nextSectionTitle ?? nextSection?.title ?? "Next section";
    const timedOut = transitionState?.reason === "timeout";

    return (
      <div
        style={{
          minHeight: "100vh",
          background:
            "radial-gradient(circle at 20% 12%, rgba(60, 196, 180, 0.14), transparent 26%), radial-gradient(circle at 60% 0%, rgba(18, 118, 139, 0.18), transparent 30%), linear-gradient(180deg,#0d1b2a 0%,#081726 56%,#020408 100%)",
          color: "#fff",
          fontFamily: "DM Sans,sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: "620px", width: "100%" }}>
          <div style={{ fontSize: "11px", letterSpacing: ".08em", textTransform: "uppercase", color: topMeta.accentColor, marginBottom: "10px" }}>
            section complete
          </div>
          <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "38px", marginBottom: "10px" }}>
            {completedSectionTitle}
            <br />
            <em style={{ color: topMeta.accentColor }}>is locked in</em>
          </div>
          <div style={{ fontSize: "14px", lineHeight: 1.8, color: "rgba(255,255,255,0.68)", marginBottom: "1.2rem" }}>
            {timedOut
              ? `Time's up — ${completedSectionTitle} has been submitted.`
              : "Your answers have been saved."}{" "}
            Next up: {nextSectionTitle}.
          </div>

          <div
            style={{
              borderRadius: "18px",
              background: "rgba(255,255,255,0.05)",
              border: "0.5px solid rgba(255,255,255,0.1)",
              padding: "1.05rem 1.1rem",
              marginBottom: "1rem",
              color: "rgba(255,255,255,0.72)",
              lineHeight: 1.7,
              fontSize: "13px",
            }}
          >
            No scores or answer feedback appear between sections. You’ll get the full report once the entire test is complete.
          </div>

          <button
            onClick={() => {
              setCurrentSectionIndex((current) => current + 1);
              setCurrentQuestionIndices((current) => ({
                ...current,
                [currentSectionIndex + 1]: current[currentSectionIndex + 1] ?? 0,
              }));
              setTransitionState(null);
              setPhase("running");
              setQuestionStartedAtMs(Date.now());
            }}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: "12px",
              border: "none",
              background: topMeta.accentColor,
              color: "#081018",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            start {nextSectionTitle.toLowerCase()} →
          </button>
        </div>
      </div>
    );
  }

  if (phase === "report" && report) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background:
            "radial-gradient(circle at 18% 10%, rgba(62, 196, 183, 0.14), transparent 24%), radial-gradient(circle at 56% 0%, rgba(22, 121, 145, 0.16), transparent 28%), linear-gradient(180deg,#0d1b2a 0%,#081726 56%,#020408 100%)",
          color: "#fff",
          fontFamily: "DM Sans,sans-serif",
          padding: "1.5rem",
        }}
      >
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <div style={{ maxWidth: "1180px", margin: "0 auto" }}>
          <nav
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              alignItems: "center",
              gap: "1rem",
              marginBottom: "2rem",
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
              <button
                onClick={() => router.push("/practice-tests")}
                style={{ background: "transparent", border: "none", color: "#fff", fontSize: "16px", cursor: "pointer" }}
              >
                practice tests
              </button>
            </div>
            <div style={{ justifySelf: "end", color: "rgba(255,255,255,0.3)", fontSize: "12px" }}>
              report saved
            </div>
          </nav>

          <div style={{ marginBottom: "1.5rem", maxWidth: "760px" }}>
            <div style={{ fontSize: "11px", letterSpacing: ".08em", textTransform: "uppercase", color: topMeta.accentColor, marginBottom: "10px" }}>
              {mode.title} report
            </div>
            <h1 style={{ fontFamily: "DM Serif Display,serif", fontSize: "clamp(2rem,4.4vw,3.6rem)", fontWeight: 400, lineHeight: 1.06, marginBottom: "10px" }}>
              your test is
              <br />
              <em style={{ color: topMeta.accentColor }}>written in the stars</em>
            </h1>
            <p style={{ fontSize: "15px", lineHeight: 1.75, color: "rgba(255,255,255,0.56)" }}>
              These scores now live in your practice-test history and give Aced a more test-like read on where you are right now.
            </p>
          </div>

          <section
            style={{
              borderRadius: "24px",
              background: "rgba(255,255,255,0.06)",
              border: "0.5px solid rgba(255,255,255,0.11)",
              padding: "1.4rem",
              marginBottom: "1.25rem",
              boxShadow: "0 18px 48px rgba(0,0,0,0.24)",
            }}
          >
            <div style={{ fontSize: "11px", letterSpacing: ".08em", textTransform: "uppercase", color: topMeta.accentColor, marginBottom: "8px" }}>
              Overall ACT Score Hero
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "18px", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "clamp(3.4rem,9vw,5.4rem)", lineHeight: 0.95, color: "#fff" }}>
                  {report.compositeEstimatedScore ? `${report.compositeEstimatedScore}` : "--"}
                </div>
                <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.72)", marginTop: "6px" }}>
                  {mode.format === "full" ? "Composite ACT estimate" : "Timed section estimate"}
                </div>
              </div>
              <div style={{ maxWidth: "440px", color: "rgba(255,255,255,0.7)", lineHeight: 1.75, fontSize: "14px" }}>
                {report.overallPacing?.description ??
                  "This score reflects your fully timed performance across the test sections you just completed."}
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "1rem" }}>
              {[
                `${report.correctCount}/${report.totalQuestionCount} correct`,
                `${report.accuracyPct}% accuracy`,
                `${report.answeredCount} answered`,
                report.overallPacing?.label ?? "pace read pending",
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
          </section>

          <section style={{ marginBottom: "1.25rem" }}>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.48)", marginBottom: "10px" }}>section score cards</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
              {report.sectionReports.map((section) => (
                <ReportSectionCard key={section.sectionRunId} section={section} accentColor={topMeta.accentColor} />
              ))}
            </div>
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 420px)", gap: "18px", alignItems: "start", marginBottom: "1.25rem" }}>
            <section style={{ borderRadius: "18px", background: "rgba(255,255,255,0.045)", border: "0.5px solid rgba(255,255,255,0.09)", padding: "1.1rem" }}>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.48)", marginBottom: "10px" }}>pacing overview</div>
              <div style={{ fontSize: "14px", color: "rgba(255,255,255,0.72)", lineHeight: 1.75, marginBottom: "1rem" }}>
                {report.overallPacing?.description ?? "Pacing details will appear once the run is complete."}
              </div>
              <div style={{ display: "grid", gap: "10px" }}>
                {report.sectionReports.map((section) => (
                  <div
                    key={`${section.sectionRunId}-pace`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      padding: "0.9rem 1rem",
                      borderRadius: "14px",
                      background: "rgba(255,255,255,0.04)",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "14px", color: "#fff", marginBottom: "4px" }}>{section.title}</div>
                      <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.48)", lineHeight: 1.6 }}>
                        {section.pacingSummary
                          ? `${section.pacingSummary.avgSecondsPerAnswered}s per answered question vs ${section.pacingSummary.targetSecondsPerQuestion}s target`
                          : "No pacing data"}
                      </div>
                    </div>
                    <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "24px", color: topMeta.accentColor }}>
                      {section.pacingSummary?.label ?? "--"}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section style={{ borderRadius: "18px", background: "rgba(255,255,255,0.045)", border: "0.5px solid rgba(255,255,255,0.09)", padding: "1.1rem" }}>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.48)", marginBottom: "10px" }}>what to work on next</div>
              <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "28px", lineHeight: 1.1, marginBottom: "10px" }}>
                {report.remediationPlan.headline}
              </div>
              <div style={{ fontSize: "13px", lineHeight: 1.75, color: "rgba(255,255,255,0.62)", marginBottom: "12px" }}>
                {report.remediationPlan.summary}
              </div>
              <div style={{ display: "grid", gap: "10px" }}>
                {report.remediationPlan.steps.length === 0 && (
                  <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.58)", lineHeight: 1.7 }}>
                    No priority drill is being forced from this run. Head back to your universe and rebuild the dimmest star next.
                  </div>
                )}
                {report.remediationPlan.steps.map((step) => (
                  <div
                    key={`${step.sectionKey}-${step.topicName}`}
                    style={{
                      borderRadius: "14px",
                      padding: "0.95rem",
                      background: "rgba(255,255,255,0.04)",
                      border: `0.5px solid ${step.sectionColor}36`,
                    }}
                  >
                    <div style={{ fontSize: "10px", color: step.sectionColor, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: "6px" }}>
                      {step.sectionTitle} · {step.constellation}
                    </div>
                    <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "22px", marginBottom: "8px" }}>{step.topicName}</div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
                      <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.66)", background: "rgba(255,255,255,0.04)", borderRadius: "999px", padding: "4px 8px" }}>
                        {step.misses} miss{step.misses === 1 ? "" : "es"}
                      </span>
                      <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.66)", background: "rgba(255,255,255,0.04)", borderRadius: "999px", padding: "4px 8px" }}>
                        {step.accuracyPct}% timed accuracy
                      </span>
                    </div>
                    <div style={{ fontSize: "12px", lineHeight: 1.7, color: "rgba(255,255,255,0.58)", marginBottom: "10px" }}>
                      {step.reason}
                    </div>
                    <button
                      onClick={() => router.push(step.drillHref)}
                      style={{
                        width: "100%",
                        padding: "11px 12px",
                        borderRadius: "12px",
                        border: "none",
                        background: step.sectionColor,
                        color: "#081018",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      start {step.topicName} drill
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section style={{ borderRadius: "18px", background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.08)", padding: "1.1rem", marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: showQuestionReview ? "1rem" : 0 }}>
              <div>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.48)", marginBottom: "6px" }}>question review</div>
                <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.64)", lineHeight: 1.7 }}>
                  Review missed questions only when you’re ready to drill into the details.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQuestionReview((current) => !current)}
                style={{
                  padding: "11px 14px",
                  borderRadius: "12px",
                  border: "0.5px solid rgba(255,255,255,0.12)",
                  background: showQuestionReview ? "rgba(255,255,255,0.08)" : "transparent",
                  color: showQuestionReview ? "#fff" : "rgba(255,255,255,0.78)",
                  cursor: "pointer",
                }}
              >
                {showQuestionReview ? "hide question review" : `open question review (${report.missedQuestions.length})`}
              </button>
            </div>

            {showQuestionReview ? (
              <div style={{ display: "grid", gap: "12px" }}>
                {report.missedQuestions.length === 0 && (
                  <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.58)", lineHeight: 1.7 }}>
                    Clean run. No missed questions to review here.
                  </div>
                )}
                {report.missedQuestions.map((item) => (
                  <div key={`${item.sectionKey}-${item.questionOrder}`} style={{ borderRadius: "14px", background: "rgba(255,255,255,0.03)", padding: "0.95rem 1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", marginBottom: "8px", flexWrap: "wrap" }}>
                      <div style={{ fontSize: "11px", color: topMeta.accentColor, letterSpacing: ".06em", textTransform: "uppercase" }}>
                        {item.sectionTitle} · question {item.questionOrder + 1}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {item.flagged ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              fontSize: "10px",
                              color: topMeta.accentColor,
                              border: `0.5px solid ${topMeta.accentColor}55`,
                              borderRadius: "999px",
                              padding: "3px 8px",
                              letterSpacing: ".04em",
                              textTransform: "uppercase",
                            }}
                          >
                            <FlagIcon filled color={topMeta.accentColor} size={11} />
                            flagged
                          </span>
                        ) : null}
                        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>{item.topicName}</div>
                      </div>
                    </div>
                    {item.question.passage && (
                      <div style={{ fontSize: "12px", lineHeight: 1.7, color: "rgba(255,255,255,0.54)", marginBottom: "10px" }}>
                        {renderFormattedText(item.question.passage)}
                      </div>
                    )}
                    <div style={{ fontFamily: "DM Serif Display,serif", fontSize: "20px", lineHeight: 1.55, marginBottom: "10px" }}>
                      {renderFormattedText(item.question.question_text)}
                    </div>
                    <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.62)", marginBottom: "8px" }}>
                      You chose {item.selectedAnswer}. Correct answer: {item.correctAnswer}.
                    </div>
                    <div style={{ fontSize: "12px", lineHeight: 1.7, color: "rgba(255,255,255,0.74)" }}>
                      {item.question.explanation}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <div style={{ display: "grid", gap: "10px", maxWidth: "380px" }}>
            {report.sessionId ? (
              <button
                onClick={() => router.push(`/practice-tests/history/${report.sessionId}`)}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: "12px",
                  border: "0.5px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.78)",
                  cursor: "pointer",
                }}
              >
                open saved review
              </button>
            ) : null}
            <button
              onClick={() => router.push("/practice-tests")}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: "12px",
                border: "none",
                background: topMeta.accentColor,
                color: "#081018",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              back to practice tests
            </button>
            <button
              onClick={() => router.push("/dashboard")}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: "12px",
                border: "0.5px solid rgba(255,255,255,0.12)",
                background: "transparent",
                color: "rgba(255,255,255,0.72)",
                cursor: "pointer",
              }}
            >
              return to your universe
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentSection || !currentQuestion) {
    return null;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 16% 12%, rgba(61, 192, 182, 0.12), transparent 24%), radial-gradient(circle at 72% 18%, rgba(18, 118, 139, 0.12), transparent 24%), linear-gradient(180deg,#0d1b2a 0%,#081726 56%,#020408 100%)",
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
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.34)" }}>
              {currentSection.title} · section {currentSectionIndex + 1}/{sections.length}
            </span>
            <button
              type="button"
              onClick={() => setQuestionMapOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                borderRadius: "999px",
                border: "0.5px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.76)",
                cursor: "pointer",
              }}
            >
              <span>Questions</span>
              <span style={{ color: topMeta.accentColor, fontWeight: 600 }}>
                {currentAnsweredCount}/{currentSection.questions.length}
              </span>
            </button>
            <div
              style={{
                padding: "8px 14px",
                borderRadius: "999px",
                background: `${topMeta.accentColor}1c`,
                border: `0.5px solid ${topMeta.accentColor}55`,
                color: topMeta.accentColor,
                fontWeight: 600,
                minWidth: "94px",
                textAlign: "center",
              }}
            >
              {formatCountdown(currentTimeRemaining)}
            </div>
            <button
              onClick={() => void handleSectionAdvance()}
              disabled={submitting}
              style={{
                padding: "8px 14px",
                borderRadius: "999px",
                border: "0.5px solid rgba(255,255,255,0.12)",
                background: "transparent",
                color: "rgba(255,255,255,0.7)",
                cursor: "pointer",
              }}
            >
              {currentSectionIndex >= sections.length - 1 ? "submit test" : "submit section"}
            </button>
          </div>
        </nav>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) 340px", gap: "18px", alignItems: "start" }}>
          <div>
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", gap: "10px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.36)" }}>
                  {currentSection.title} · question {currentQuestionIndex + 1} of {currentSection.questions.length}
                </span>
                <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>
                  {currentAnsweredCount} answered · {currentFlaggedCount} flagged ·{" "}
                  {currentRemainingCount} remaining
                </span>
              </div>
              <div style={{ height: "4px", borderRadius: "999px", background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${((currentQuestionIndex + 1) / Math.max(currentSection.questions.length, 1)) * 100}%`,
                    background: topMeta.accentColor,
                    borderRadius: "999px",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "0.9rem" }}>
              <span style={{ fontSize: "10px", padding: "4px 10px", borderRadius: "999px", background: `${topMeta.accentColor}16`, border: `0.5px solid ${topMeta.accentColor}44`, color: topMeta.accentColor }}>
                {currentSection.sectionKey} · {topMeta.constellation}
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
                const selectedAnswer = currentQuestionKey ? selectedAnswers[currentQuestionKey] : null;
                const isPicked = selectedAnswer === letter;

                return (
                  <button
                    key={letter}
                    onClick={() => {
                      if (!currentQuestionKey) return;
                      setSelectedAnswers((current) => ({ ...current, [currentQuestionKey]: letter }));
                    }}
                    style={{
                      textAlign: "left",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "12px",
                      padding: "12px 14px",
                      borderRadius: "12px",
                      border: `0.5px solid ${isPicked ? "rgba(255,255,255,0.34)" : "rgba(255,255,255,0.1)"}`,
                      background: isPicked ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                      color: "rgba(255,255,255,0.82)",
                      cursor: "pointer",
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
                        color: "rgba(255,255,255,0.76)",
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

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={toggleFlag}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border:
                    currentQuestionKey && flaggedKeys.includes(currentQuestionKey)
                      ? `0.5px solid ${topMeta.accentColor}55`
                      : "0.5px solid rgba(255,255,255,0.12)",
                  background:
                    currentQuestionKey && flaggedKeys.includes(currentQuestionKey)
                      ? `${topMeta.accentColor}16`
                      : "transparent",
                  color:
                    currentQuestionKey && flaggedKeys.includes(currentQuestionKey)
                      ? topMeta.accentColor
                      : "rgba(255,255,255,0.68)",
                  cursor: "pointer",
                }}
              >
                <FlagIcon
                  filled={Boolean(currentQuestionKey && flaggedKeys.includes(currentQuestionKey))}
                  color={
                    currentQuestionKey && flaggedKeys.includes(currentQuestionKey)
                      ? topMeta.accentColor
                      : "rgba(255,255,255,0.68)"
                  }
                  size={14}
                />
                {currentQuestionKey && flaggedKeys.includes(currentQuestionKey)
                  ? "flagged for review"
                  : "flag for review"}
              </button>
              <button
                type="button"
                onClick={() => goToQuestion(Math.max(0, currentQuestionIndex - 1))}
                disabled={currentQuestionIndex === 0}
                style={{
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: "0.5px solid rgba(255,255,255,0.12)",
                  background: "transparent",
                  color: currentQuestionIndex === 0 ? "rgba(255,255,255,0.26)" : "rgba(255,255,255,0.7)",
                  cursor: currentQuestionIndex === 0 ? "default" : "pointer",
                }}
              >
                previous
              </button>
              <button
                type="button"
                onClick={() => goToQuestion(Math.min(currentSection.questions.length - 1, currentQuestionIndex + 1))}
                disabled={currentQuestionIndex >= currentSection.questions.length - 1}
                style={{
                  padding: "10px 14px",
                  borderRadius: "12px",
                  border: "0.5px solid rgba(255,255,255,0.12)",
                  background: "transparent",
                  color: currentQuestionIndex >= currentSection.questions.length - 1 ? "rgba(255,255,255,0.26)" : "rgba(255,255,255,0.7)",
                  cursor: currentQuestionIndex >= currentSection.questions.length - 1 ? "default" : "pointer",
                }}
              >
                next
              </button>
            </div>
          </div>

          <aside
            style={{
              borderRadius: "18px",
              background: "rgba(255,255,255,0.045)",
              border: "0.5px solid rgba(255,255,255,0.09)",
              padding: "1rem",
              position: "sticky",
              top: "1.25rem",
            }}
          >
            {timeWarningMessage ? (
              <div
                style={{
                  marginBottom: "0.9rem",
                  padding: "0.85rem 0.95rem",
                  borderRadius: "14px",
                  background: `${topMeta.accentColor}14`,
                  border: `0.5px solid ${topMeta.accentColor}36`,
                  color: "rgba(255,255,255,0.78)",
                  fontSize: "12px",
                  lineHeight: 1.6,
                }}
              >
                {timeWarningMessage}
              </div>
            ) : null}
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.34)", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: "10px" }}>
              section controls
            </div>

            <div style={{ display: "grid", gap: "8px", marginBottom: "1rem" }}>
              {[
                { value: currentQuestionIndex + 1, label: "current" },
                { value: currentAnsweredCount, label: "answered" },
                { value: currentFlaggedCount, label: "flagged" },
                { value: currentRemainingCount, label: "remaining" },
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

            <div style={{ display: "grid", gap: "8px", marginBottom: "1rem" }}>
              <button
                type="button"
                onClick={() => setQuestionMapOpen(true)}
                style={{
                  width: "100%",
                  padding: "11px 12px",
                  borderRadius: "12px",
                  border: "0.5px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.82)",
                  cursor: "pointer",
                }}
              >
                open questions drawer
              </button>
              {unresolvedQuestionIndices.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setSubmitWarningOpen(false);
                    setQuestionMapOpen(true);
                  }}
                  style={{
                    width: "100%",
                    padding: "11px 12px",
                    borderRadius: "12px",
                    border: `0.5px solid ${topMeta.accentColor}36`,
                    background: `${topMeta.accentColor}12`,
                    color: topMeta.accentColor,
                    cursor: "pointer",
                  }}
                >
                  review {unresolvedQuestionIndices.length} unresolved question
                  {unresolvedQuestionIndices.length === 1 ? "" : "s"}
                </button>
              ) : null}
            </div>

            {flaggedQuestionIndices.length > 0 && (
              <div
                style={{
                  marginBottom: "1rem",
                  padding: "0.95rem 1rem",
                  borderRadius: "14px",
                  background: "rgba(255,255,255,0.03)",
                  border: "0.5px solid rgba(255,255,255,0.08)",
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    color: topMeta.accentColor,
                    letterSpacing: ".06em",
                    textTransform: "uppercase",
                    marginBottom: "10px",
                  }}
                >
                  marked for review
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {flaggedQuestionIndices.map((index) => (
                    <button
                      key={`flagged-${index}`}
                      type="button"
                      onClick={() => goToQuestion(index)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        minWidth: "38px",
                        padding: "8px 10px",
                        borderRadius: "999px",
                        border: `0.5px solid ${topMeta.accentColor}66`,
                        background:
                          index === currentQuestionIndex
                            ? `${topMeta.accentColor}22`
                            : "rgba(255,255,255,0.03)",
                        color: index === currentQuestionIndex ? topMeta.accentColor : "#fff",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: 600,
                      }}
                    >
                      <FlagIcon
                        filled
                        color={index === currentQuestionIndex ? topMeta.accentColor : "#fff"}
                        size={11}
                      />
                      {index + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentSection.sectionKey === "math" && mode.includesDesmos && (
              <div style={{ marginBottom: "1rem" }}>
                <button
                  onClick={() => setShowCalculator((current) => !current)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "12px",
                    border: "0.5px solid rgba(255,255,255,0.12)",
                    background: showCalculator ? `${topMeta.accentColor}16` : "transparent",
                    color: showCalculator ? topMeta.accentColor : "rgba(255,255,255,0.72)",
                    cursor: "pointer",
                    marginBottom: showCalculator ? "10px" : 0,
                  }}
                >
                  {showCalculator ? "hide calculator" : "open calculator"}
                </button>
                {showCalculator && (
                  <div style={{ borderRadius: "14px", overflow: "hidden", border: "0.5px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.2)" }}>
                    <div style={{ padding: "8px 10px", fontSize: "11px", color: "rgba(255,255,255,0.46)", borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}>
                      Desmos Graphing Calculator
                    </div>
                    <iframe
                      title="Desmos Graphing Calculator"
                      src="https://www.desmos.com/calculator"
                      style={{ width: "100%", height: "360px", border: "none", display: "block" }}
                    />
                  </div>
                )}
              </div>
            )}

            <div
              style={{
                borderRadius: "14px",
                background: "rgba(255,255,255,0.04)",
                borderLeft: `2px solid ${topMeta.accentColor}`,
                padding: "0.95rem 1rem",
                fontSize: "12px",
                lineHeight: 1.7,
                color: "rgba(255,255,255,0.52)",
              }}
            >
              No instant answer reveals here. Take it like a real section, then review once you submit or run out of time.
            </div>
          </aside>
        </div>
      </div>
      <QuestionMapDrawer
        open={questionMapOpen}
        section={currentSection}
        currentQuestionIndex={currentQuestionIndex}
        selectedAnswers={selectedAnswers}
        flaggedKeys={flaggedKeys}
        sectionIndex={currentSectionIndex}
        accentColor={topMeta.accentColor}
        onClose={() => setQuestionMapOpen(false)}
        onQuestionSelect={goToQuestion}
      />
      <SubmitSectionModal
        open={submitWarningOpen}
        sectionTitle={currentSection.title}
        unansweredCount={currentRemainingCount}
        flaggedCount={currentFlaggedCount}
        accentColor={topMeta.accentColor}
        onReviewQuestions={() => {
          setSubmitWarningOpen(false);
          setQuestionMapOpen(true);
        }}
        onConfirmSubmit={() => {
          void handleSectionAdvance("manual", true);
        }}
      />
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
