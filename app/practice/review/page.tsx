"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DM_Sans, Playfair_Display } from "next/font/google";
import NightSky from "@/components/NightSky";
import QuestionContent from "@/components/question-content/QuestionContent";
import styles from "./review.module.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
  weight: ["600", "700"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const SECTION_META = {
  english: { label: "English", color: "#5DCAA5" },
  math: { label: "Math", color: "#AFA9EC" },
  reading: { label: "Reading", color: "#EF9F27" },
  science: { label: "Science", color: "#F0997B" },
} as const;

type SectionKey = keyof typeof SECTION_META;
type AnswerLetter = "A" | "B" | "C" | "D";

type ReviewItem = {
  answerId: string;
  sessionId: string;
  questionId: string;
  section: SectionKey;
  topic: string;
  difficulty: string;
  submittedAt: string;
  questionNumber: number;
  selectedAnswer: AnswerLetter;
  correctAnswer: AnswerLetter;
  question: {
    passage: string | null;
    question_text: string;
    choices: Record<AnswerLetter, string>;
    explanation: string;
  };
};

type RetryState = {
  sessionId: string;
  selected: AnswerLetter | null;
  submitting: boolean;
  result: "idle" | "wrong";
};

function ReviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sourceSessionId = searchParams.get("sessionId");
  const [section, setSection] = useState<SectionKey | "all">("all");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryByQuestion, setRetryByQuestion] = useState<Record<string, RetryState>>({});
  const [tutorInput, setTutorInput] = useState<Record<string, string>>({});
  const [tutorLoading, setTutorLoading] = useState<Record<string, boolean>>({});
  const [tutorMessages, setTutorMessages] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (sourceSessionId) params.set("sessionId", sourceSessionId);
    if (section !== "all") params.set("section", section);

    setLoading(true);
    setError(null);

    fetch(`/api/practice/review?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as { items?: ReviewItem[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Could not load review.");
        return payload;
      })
      .then((payload) => {
        if (!active) return;
        setItems(payload.items ?? []);
      })
      .catch((reason) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Could not load review.");
        setItems([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [section, sourceSessionId]);

  const title = sourceSessionId ? "review this session" : "review missed questions";
  const subtitle = sourceSessionId
    ? "Work through the questions you missed in this practice session."
    : "Your unresolved misses from the last 30 days, newest first.";

  async function startRetry(item: ReviewItem) {
    const response = await fetch("/api/practice/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: item.questionId }),
    });
    const payload = (await response.json()) as { sessionId?: string; error?: string };
    if (!response.ok || !payload.sessionId) {
      setError(payload.error || "Could not start retry.");
      return;
    }

    setRetryByQuestion((current) => ({
      ...current,
      [item.questionId]: {
        sessionId: payload.sessionId!,
        selected: null,
        submitting: false,
        result: "idle",
      },
    }));
  }

  async function submitRetry(item: ReviewItem) {
    const retry = retryByQuestion[item.questionId];
    if (!retry?.selected || retry.submitting) return;

    setRetryByQuestion((current) => ({
      ...current,
      [item.questionId]: { ...retry, submitting: true },
    }));

    try {
      const response = await fetch("/api/practice/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: retry.sessionId,
          questionId: item.questionId,
          selectedAnswer: retry.selected,
          timeSpentSeconds: 1,
        }),
      });
      const payload = (await response.json()) as { isCorrect?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not submit retry.");

      if (payload.isCorrect) {
        setItems((current) => current.filter((entry) => entry.questionId !== item.questionId));
        setRetryByQuestion((current) => {
          const next = { ...current };
          delete next[item.questionId];
          return next;
        });
      } else {
        setRetryByQuestion((current) => ({
          ...current,
          [item.questionId]: { ...retry, submitting: false, result: "wrong" },
        }));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not submit retry.");
      setRetryByQuestion((current) => ({
        ...current,
        [item.questionId]: { ...retry, submitting: false },
      }));
    }
  }

  async function sendTutor(item: ReviewItem) {
    const message = (tutorInput[item.questionId] ?? "").trim();
    if (!message || tutorLoading[item.questionId]) return;

    setTutorInput((current) => ({ ...current, [item.questionId]: "" }));
    setTutorMessages((current) => ({
      ...current,
      [item.questionId]: [...(current[item.questionId] ?? []), `You: ${message}`],
    }));
    setTutorLoading((current) => ({ ...current, [item.questionId]: true }));

    try {
      const response = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          questionId: item.questionId,
          sessionId: item.sessionId,
          action: "message",
        }),
      });
      const payload = (await response.json()) as { reply?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "Tutor unavailable.");
      setTutorMessages((current) => ({
        ...current,
        [item.questionId]: [
          ...(current[item.questionId] ?? []),
          payload.reply || "Let's review it.",
        ],
      }));
    } catch {
      setTutorMessages((current) => ({
        ...current,
        [item.questionId]: [
          ...(current[item.questionId] ?? []),
          "Tutor is unavailable right now. Try again in a minute.",
        ],
      }));
    } finally {
      setTutorLoading((current) => ({ ...current, [item.questionId]: false }));
    }
  }

  return (
    <div className={`${styles.page} ${playfair.variable} ${dmSans.variable}`}>
      <NightSky />
      <main className={styles.shell}>
        <header className={styles.header}>
          <button className={styles.backButton} onClick={() => router.push("/dashboard")}>
            ← dashboard
          </button>
          <div>
            <div className={styles.eyebrow}>PRACTICE REVIEW</div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </header>

        {!sourceSessionId ? (
          <div className={styles.filters}>
            <button
              className={section === "all" ? styles.filterActive : styles.filter}
              onClick={() => setSection("all")}
            >
              All
            </button>
            {(Object.keys(SECTION_META) as SectionKey[]).map((key) => (
              <button
                key={key}
                className={section === key ? styles.filterActive : styles.filter}
                style={{ "--filter-color": SECTION_META[key].color } as React.CSSProperties}
                onClick={() => setSection(key)}
              >
                {SECTION_META[key].label}
              </button>
            ))}
          </div>
        ) : null}

        {error ? <div className={styles.error}>{error}</div> : null}
        {loading ? <div className={styles.empty}>loading your missed questions…</div> : null}

        {!loading && items.length === 0 ? (
          <div className={styles.empty}>
            <strong>Nothing to review. Nice work ✦</strong>
            <span>Your fixed questions disappear from this list automatically.</span>
          </div>
        ) : null}

        <div className={styles.list}>
          {items.map((item) => {
            const meta = SECTION_META[item.section];
            const retry = retryByQuestion[item.questionId];
            const retrying = Boolean(retry);

            return (
              <article
                key={item.answerId}
                className={styles.card}
                style={{ "--section-color": meta.color } as React.CSSProperties}
              >
                <div className={styles.cardTop}>
                  <div>
                    <span className={styles.sectionPill}>{meta.label}</span>
                    <span className={styles.topic}>{item.topic}</span>
                  </div>
                  <time>{new Date(item.submittedAt).toLocaleDateString()}</time>
                </div>

                {item.question.passage ? (
                  <div className={styles.passage}>
                    <div className={styles.label}>PASSAGE / FIGURE</div>
                    <QuestionContent
                      text={item.question.passage}
                      questionNumber={item.section === "english" ? item.questionNumber : undefined}
                    />
                  </div>
                ) : null}

                <div className={styles.question}>
                  <QuestionContent
                    text={item.question.question_text}
                    questionNumber={item.section === "english" ? item.questionNumber : undefined}
                  />
                </div>

                {retrying ? (
                  <div className={styles.retryBox}>
                    <div className={styles.retryTitle}>Try it again — answer hidden</div>
                    <div className={styles.choices}>
                      {(["A", "B", "C", "D"] as AnswerLetter[]).map((letter) => (
                        <button
                          key={letter}
                          className={
                            retry.selected === letter
                              ? `${styles.choice} ${styles.choicePicked}`
                              : styles.choice
                          }
                          onClick={() =>
                            setRetryByQuestion((current) => ({
                              ...current,
                              [item.questionId]: { ...retry, selected: letter, result: "idle" },
                            }))
                          }
                        >
                          <b>{letter}</b>
                          <QuestionContent text={item.question.choices[letter]} />
                        </button>
                      ))}
                    </div>
                    {retry.result === "wrong" ? (
                      <div className={styles.retryWrong}>Not quite. This one stays in your review list.</div>
                    ) : null}
                    <div className={styles.actions}>
                      <button
                        className={styles.primary}
                        disabled={!retry.selected || retry.submitting}
                        onClick={() => void submitRetry(item)}
                      >
                        {retry.submitting ? "checking…" : "submit answer"}
                      </button>
                      <button
                        className={styles.secondary}
                        onClick={() =>
                          setRetryByQuestion((current) => {
                            const next = { ...current };
                            delete next[item.questionId];
                            return next;
                          })
                        }
                      >
                        cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={styles.choices}>
                      {(["A", "B", "C", "D"] as AnswerLetter[]).map((letter) => {
                        const wrong = letter === item.selectedAnswer;
                        const right = letter === item.correctAnswer;
                        return (
                          <div
                            key={letter}
                            className={
                              right
                                ? `${styles.choice} ${styles.choiceRight}`
                                : wrong
                                  ? `${styles.choice} ${styles.choiceWrong}`
                                  : styles.choice
                            }
                          >
                            <b>{letter}</b>
                            <QuestionContent text={item.question.choices[letter]} />
                            {right ? <span className={styles.choiceTag}>correct</span> : null}
                            {wrong && !right ? <span className={styles.choiceTag}>your answer</span> : null}
                          </div>
                        );
                      })}
                    </div>

                    <div className={styles.explanation}>
                      <div className={styles.label}>EXPLANATION</div>
                      <QuestionContent text={item.question.explanation} />
                    </div>

                    <div className={styles.actions}>
                      <button className={styles.primary} onClick={() => void startRetry(item)}>
                        Try it again
                      </button>
                    </div>

                    <div className={styles.tutor}>
                      <div className={styles.tutorTitle}>AI tutor · review mode</div>
                      {(tutorMessages[item.questionId] ?? []).map((message, index) => (
                        <div key={index} className={styles.tutorMessage}>
                          <QuestionContent text={message} />
                        </div>
                      ))}
                      <div className={styles.tutorInputRow}>
                        <input
                          value={tutorInput[item.questionId] ?? ""}
                          onChange={(event) =>
                            setTutorInput((current) => ({
                              ...current,
                              [item.questionId]: event.target.value,
                            }))
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") void sendTutor(item);
                          }}
                          placeholder="ask why, or ask for a simpler explanation…"
                        />
                        <button
                          disabled={tutorLoading[item.questionId]}
                          onClick={() => void sendTutor(item)}
                        >
                          {tutorLoading[item.questionId] ? "…" : "ask"}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}

export default function PracticeReviewPage() {
  return (
    <Suspense fallback={null}>
      <ReviewContent />
    </Suspense>
  );
}
