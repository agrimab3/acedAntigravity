"use client";

import { Fragment, Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { getTopicByName, type SectionKey } from "@/lib/act-taxonomy";
import {
  formatDifficultyBand,
  normalizeDifficultyBand,
  type DifficultyBand,
} from "@/lib/adaptive";

type Question = {
  id: string;
  section: string;
  topic: string;
  difficulty: string;
  passage?: string | null;
  question_text: string;
  choices: { A: string; B: string; C: string; D: string };
  correct_answer: string;
  explanation: string;
};

type AdaptiveStatus = {
  label: string;
  description: string;
  direction: "up" | "down" | "steady";
};

const DIFFICULTY_ORDER: DifficultyBand[] = [
  "foundation",
  "easy",
  "medium",
  "hard",
  "challenge",
];

const SECTION_META: Record<string, { color: string; constellation: string }> = {
  english: { color: '#5DCAA5', constellation: 'Gemini' },
  math: { color: '#AFA9EC', constellation: 'Aquarius' },
  reading: { color: '#EF9F27', constellation: 'Virgo' },
  science: { color: '#F0997B', constellation: 'Sagittarius' },
};

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

function getIntroTutorMessage(topic: string, officialCategory?: string) {
  const context = officialCategory ? `${topic} in ${officialCategory}` : topic;
  return topic
    ? `i'm here while you work on ${context}. ask for a hint, a simpler explanation, or why a choice is wrong.`
    : "i'm here while you practice. ask for a hint, a simpler explanation, or why an answer choice is wrong.";
}

function sortQuestionsTowardDifficulty(questions: Question[], target: string) {
  const normalizedTarget = normalizeDifficultyBand(target);
  const targetIndex = DIFFICULTY_ORDER.indexOf(normalizedTarget);

  return [...questions].sort((a, b) => {
    const aIndex = DIFFICULTY_ORDER.indexOf(normalizeDifficultyBand(a.difficulty));
    const bIndex = DIFFICULTY_ORDER.indexOf(normalizeDifficultyBand(b.difficulty));

    return Math.abs(aIndex - targetIndex) - Math.abs(bIndex - targetIndex);
  });
}

function PracticeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { status } = useSession();
  const section = searchParams.get("section") || "english";
  const topic = searchParams.get("topic") || "";
  const difficulty = searchParams.get("difficulty") || "";
  const meta = SECTION_META[section] || SECTION_META.english;
  const topicDefinition = getTopicByName(section as SectionKey, topic);
  const officialCategory = topicDefinition?.officialCategory;

  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(true);
  const [practiceSessionId, setPracticeSessionId] = useState<string | null>(null);
  const [targetDifficulty, setTargetDifficulty] = useState("medium");
  const [adaptiveStatus, setAdaptiveStatus] = useState<AdaptiveStatus>({
    label: "finding your level",
    description: "Aced is finding your level, so the session is starting in medium mode.",
    direction: "steady",
  });
  const [qIndex, setQIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [missed, setMissed] = useState<Question[]>([]);
  const [aiMessages, setAiMessages] = useState<{role: string; text: string}[]>([
    { role: "bot", text: getIntroTutorMessage(topic, officialCategory) },
  ]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionFinalized, setSessionFinalized] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [questionStartedAtMs, setQuestionStartedAtMs] = useState<number>(Date.now());
  const [questionElapsedSeconds, setQuestionElapsedSeconds] = useState(0);
  const [questionHintCount, setQuestionHintCount] = useState(0);
  const [questionTimings, setQuestionTimings] = useState<number[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const msgsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [router, status]);

  useEffect(() => {
    let active = true;

    setQIndex(0);
    setPicked(null);
    setSubmitted(false);
    setPracticeSessionId(null);
    setTargetDifficulty("medium");
    setAdaptiveStatus({
      label: "finding your level",
      description: "Aced is finding your level, so the session is starting in medium mode.",
      direction: "steady",
    });
    setCorrect(0);
    setAnswered(0);
    setMissed([]);
    setDone(false);
    setSessionStarted(false);
    setSessionFinalized(false);
    setElapsedSeconds(0);
    setQuestionStartedAtMs(Date.now());
    setQuestionElapsedSeconds(0);
    setQuestionHintCount(0);
    setQuestionTimings([]);
    setAiMessages([{ role: "bot", text: getIntroTutorMessage(topic, officialCategory) }]);
    setQuestionsLoading(true);

    const fetchQuestions = async () => {
      try {
        const params = new URLSearchParams({
          section,
          limit: "10",
        });

        if (topic) {
          params.set("topic", topic);
        }

        if (difficulty) {
          params.set("difficulty", difficulty);
        }

        const res = await fetch(`/api/questions?${params.toString()}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as {
          questions?: Question[];
          sessionId?: string | null;
          adaptive?: {
            targetDifficulty?: string;
            label?: string;
            description?: string;
            direction?: "up" | "down" | "steady";
          };
        };

        if (!active) return;
        setQuestions(sortQuestionsTowardDifficulty(data.questions ?? [], data.adaptive?.targetDifficulty ?? "medium"));
        setPracticeSessionId(data.sessionId ?? null);
        setTargetDifficulty(data.adaptive?.targetDifficulty ?? "medium");
        setAdaptiveStatus({
          label: data.adaptive?.label ?? "finding your level",
          description:
            data.adaptive?.description ??
            "Aced is finding your level, so the session is starting in medium mode.",
          direction: data.adaptive?.direction ?? "steady",
        });
      } catch (error) {
        console.error("Failed to fetch questions", error);
        if (!active) return;
        setQuestions([]);
        setPracticeSessionId(null);
        setTargetDifficulty("medium");
      } finally {
        if (active) {
          setQuestionsLoading(false);
        }
      }
    };

    void fetchQuestions();

    return () => {
      active = false;
    };
  }, [difficulty, officialCategory, section, topic]);

  // star canvas
  useEffect(() => {
    if (!sessionStarted || done) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    const stars = Array.from({ length: 120 }, () => ({
      x: Math.random(), y: Math.random(),
      r: 0.3 + Math.random() * 1.1,
      o: 0.05 + Math.random() * 0.55,
      sp: 0.3 + Math.random() * 1.5,
      ph: Math.random() * Math.PI * 2,
    }));
    let raf = 0;
    const draw = (ts: number) => {
      const t = ts * 0.001;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      stars.forEach(s => {
        const px = s.x * canvas.width;
        const py = s.y * canvas.height;
        const fade = Math.max(0, 1 - (py / canvas.height) * 1.8);
        ctx.globalAlpha = s.o * (0.6 + 0.4 * Math.sin(t * s.sp + s.ph)) * fade;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(px, py, s.r, 0, Math.PI * 2); ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [done, sessionStarted]);

  useEffect(() => {
    if (!sessionStarted || done) return;
    const interval = setInterval(() => {
      setElapsedSeconds((t) => t + 1);
      setQuestionElapsedSeconds(Math.max(1, Math.round((Date.now() - questionStartedAtMs) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [done, questionStartedAtMs, sessionStarted]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const q = questions[qIndex];

  const handlePick = (letter: string) => {
    if (submitted) return;
    setPicked(letter);
  };

  const finalizeSession = async () => {
    if (sessionFinalized) return;

    setSessionFinalized(true);

    if (!practiceSessionId) return;

    try {
      await fetch("/api/practice/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: practiceSessionId,
          durationSeconds: elapsedSeconds,
        }),
      });
    } catch (error) {
      console.error("Failed to finalize practice session", error);
    }
  };

  const handleSubmit = async () => {
    if (!picked || submitted) return;
    setSubmitted(true);
    const isCorrect = picked === q.correct_answer;
    const timeSpentSeconds = Math.max(1, Math.round((Date.now() - questionStartedAtMs) / 1000));
    const newAnswered = answered + 1;
    const newCorrect = isCorrect ? correct + 1 : correct;
    setQuestionTimings((prev) => [...prev, timeSpentSeconds]);
    setAnswered(newAnswered);
    if (isCorrect) setCorrect(newCorrect);
    else setMissed(prev => [...prev, q]);

    if (practiceSessionId && !q.id.startsWith("mock-")) {
      try {
        const res = await fetch("/api/practice/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: practiceSessionId,
            questionId: q.id,
            selectedAnswer: picked,
            isCorrect,
            timeSpentSeconds,
            hintCount: questionHintCount,
          }),
        });

        const data = (await res.json()) as {
          adaptive?: {
            recommendedDifficulty?: string;
            label?: string;
            description?: string;
            direction?: "up" | "down" | "steady";
          };
        };

        if (data.adaptive?.recommendedDifficulty) {
          const recommendedDifficulty = data.adaptive.recommendedDifficulty;
          setTargetDifficulty(recommendedDifficulty);
          setAdaptiveStatus({
            label: data.adaptive.label ?? "staying targeted",
            description:
              data.adaptive.description ??
              `Aced is keeping you at ${formatDifficultyBand(recommendedDifficulty)} difficulty for now.`,
            direction: data.adaptive.direction ?? "steady",
          });
          setQuestions((prev) => {
            const answered = prev.slice(0, qIndex + 1);
            const remaining = prev.slice(qIndex + 1);
            return [...answered, ...sortQuestionsTowardDifficulty(remaining, recommendedDifficulty)];
          });
        }
      } catch (error) {
        console.error("Failed to record answer", error);
      }
    }

    setAiMessages([{
      role: 'bot',
      text: isCorrect
        ? `great job! ${q.explanation}`
        : `not quite! ${q.explanation} want me to explain further?`
    }]);

  };

  const handleNext = async () => {
    if (qIndex + 1 >= questions.length) {
      await finalizeSession();
      setDone(true);
    } else {
      setQIndex(i => i + 1);
      setPicked(null);
      setSubmitted(false);
      setQuestionStartedAtMs(Date.now());
      setQuestionElapsedSeconds(0);
      setQuestionHintCount(0);
      setAiMessages([{ role: "bot", text: getIntroTutorMessage(topic, officialCategory) }]);
    }
  };

  const sendAI = async () => {
    if (!aiInput.trim() || aiLoading) return;
    const msg = aiInput.trim();
    setAiInput('');
    setAiMessages(prev => [...prev, { role: 'user', text: msg }]);
    setAiLoading(true);
    setQuestionHintCount((count) => count + 1);
    try {
      const res = await fetch('/api/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          question: q.passage
            ? `Passage:\n${q.passage}\n\nQuestion:\n${q.question_text}`
            : q.question_text,
          section, topic,
          explanation: q.explanation,
          difficulty: q.difficulty,
          sessionAccuracyPct: answered > 0 ? Math.round((correct / answered) * 100) : 0,
          targetDifficulty,
          officialCategory,
        }),
      });
      const data = await res.json();
      setAiMessages(prev => [...prev, { role: 'bot', text: data.reply }]);
    } catch {
      setAiMessages(prev => [...prev, { role: 'bot', text: 'sorry, I had trouble connecting. try again!' }]);
    }
    setAiLoading(false);
    setTimeout(() => { if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight; }, 100);
  };

  const pct = questions.length > 0 ? Math.round((qIndex / questions.length) * 100) : 0;
  const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;
  const averageQuestionTimeSeconds =
    questionTimings.length > 0
      ? Math.round(questionTimings.reduce((sum, value) => sum + value, 0) / questionTimings.length)
      : 0;
  const adaptiveToneColor =
    adaptiveStatus.direction === "up"
      ? "#5DCAA5"
      : adaptiveStatus.direction === "down"
        ? "#F0997B"
        : "#AFA9EC";

  if (status === "loading" || questionsLoading) {
    return (
      <div style={{ background: '#060d1e', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontFamily: 'DM Sans,sans-serif' }}>
        loading questions...
      </div>
    );
  }

  if (!questionsLoading && questions.length === 0) {
    return (
      <div style={{ background: 'linear-gradient(180deg,#0d1b2a,#060d1e,#020408)', minHeight: '100vh', color: '#fff', fontFamily: 'DM Sans,sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ maxWidth: '520px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'DM Serif Display,serif', fontSize: '30px', marginBottom: '10px' }}>
            no questions yet
          </div>
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '14px', lineHeight: 1.7, marginBottom: '1.5rem' }}>
            This topic does not have database-backed questions yet. Once the `aced` database is seeded, this page will pull live content automatically.
          </div>
          <button onClick={() => router.push('/dashboard')} style={{ padding: '12px 18px', borderRadius: '10px', border: 'none', background: meta.color, color: '#fff', fontFamily: 'DM Sans,sans-serif', cursor: 'pointer' }}>
            back to universe
          </button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div style={{ background: 'linear-gradient(180deg,#0d1b2a,#060d1e,#020408)', minHeight: '100vh', color: '#fff', fontFamily: 'DM Sans,sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontFamily: 'DM Serif Display,serif', fontSize: '28px', marginBottom: '8px' }}>
            {accuracy >= 80 ? 'amazing work! ✦' : accuracy >= 60 ? 'nice effort! ✦' : 'keep going! ✦'}
          </div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '1.5rem' }}>{topic} · {section}</div>
          {officialCategory && (
            <div style={{ fontSize: '12px', color: meta.color, marginBottom: '1rem' }}>
              official ACT category: {officialCategory}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '1.5rem' }}>
            {[{ val: correct, lbl: 'correct', col: meta.color }, { val: missed.length, lbl: 'missed', col: '#F0997B' }, { val: accuracy + '%', lbl: 'accuracy', col: '#AFA9EC' }, { val: formatTime(elapsedSeconds), lbl: 'time', col: '#ffffff' }].map(s => (
              <div key={s.lbl} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '1rem' }}>
                <div style={{ fontFamily: 'DM Serif Display,serif', fontSize: '28px', color: s.col }}>{s.val}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '4px' }}>{s.lbl}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.42)', marginBottom: '1rem' }}>
            average logged time per question: {averageQuestionTimeSeconds > 0 ? formatTime(averageQuestionTimeSeconds) : "0:00"}
          </div>
          <div style={{ height: '4px', background: 'rgba(255,255,255,0.07)', borderRadius: '2px', marginBottom: '1.5rem', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: accuracy + '%', background: meta.color, borderRadius: '2px', transition: 'width 1s ease' }} />
          </div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', padding: '12px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', borderLeft: `2px solid ${meta.color}`, marginBottom: '1.5rem' }}>
            your star got brighter ✦ keep practicing to light it up fully
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => router.push('/dashboard')} style={{ flex: 1, padding: '12px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer', background: meta.color, border: 'none', color: '#fff', fontFamily: 'DM Sans,sans-serif' }}>back to universe</button>
            {missed.length > 0 && <button style={{ flex: 1, padding: '12px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer', background: 'transparent', border: '0.5px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', fontFamily: 'DM Sans,sans-serif' }}>review {missed.length} missed →</button>}
          </div>
        </div>
      </div>
    );
  }

  if (!q) return null;

  if (!sessionStarted) {
    return (
      <div style={{ background: 'linear-gradient(180deg,#0d1b2a,#060d1e,#020408)', minHeight: '100vh', color: '#fff', fontFamily: 'DM Sans,sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ maxWidth: '520px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '.08em', color: meta.color, marginBottom: '10px' }}>
            {section.toUpperCase()} · {meta.constellation}
          </div>
          {officialCategory && (
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.42)', marginBottom: '10px' }}>
              official ACT category: {officialCategory}
            </div>
          )}
          <div style={{ fontFamily: 'DM Serif Display,serif', fontSize: '32px', marginBottom: '10px' }}>
            ready to light up <em style={{ color: meta.color, fontStyle: 'italic' }}> {topic || 'this star'}</em>?
          </div>
          <div style={{ fontSize: '14px', lineHeight: 1.7, color: 'rgba(255,255,255,0.45)', marginBottom: '1.5rem' }}>
            you’ll work through {questions.length} questions, get instant explanations, and can move on whenever you’re ready.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginBottom: '1.5rem' }}>
            {[{ val: questions.length, lbl: 'questions' }, { val: 'live', lbl: 'stopwatch' }, { val: 'AI', lbl: 'tutor on' }].map((item) => (
              <div key={item.lbl} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '1rem' }}>
                <div style={{ fontFamily: 'DM Serif Display,serif', fontSize: '26px', color: meta.color }}>{item.val}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '4px' }}>{item.lbl}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', padding: '12px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', borderLeft: `2px solid ${adaptiveToneColor}`, marginBottom: '1.5rem', textAlign: 'left' }}>
            <div style={{ fontSize: '10px', letterSpacing: '.06em', textTransform: 'uppercase', color: adaptiveToneColor, marginBottom: '4px' }}>
              {adaptiveStatus.label}
            </div>
            {adaptiveStatus.description}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => router.push('/dashboard')} style={{ flex: 1, padding: '12px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer', background: 'transparent', border: '0.5px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', fontFamily: 'DM Sans,sans-serif' }}>
              back
            </button>
            <button onClick={() => { setQuestionStartedAtMs(Date.now()); setSessionStarted(true); }} style={{ flex: 2, padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', background: meta.color, border: 'none', color: '#fff', fontFamily: 'DM Sans,sans-serif' }}>
              continue →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', background: 'linear-gradient(180deg,#0d1b2a 0%,#060d1e 60%,#020408 100%)', minHeight: '100vh', color: '#fff', fontFamily: 'DM Sans,sans-serif', padding: '1.5rem', overflow: 'hidden' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet" />

      <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '1180px', margin: '0 auto' }}>

        {/* nav */}
        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ fontFamily: 'DM Serif Display,serif', fontSize: '18px' }}>Aced<em style={{ color: '#1D9E75' }}>.</em></div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', fontVariantNumeric: 'tabular-nums' }}>{formatTime(elapsedSeconds)}</span>
            <button onClick={() => { void finalizeSession(); setDone(true); }} style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', background: 'transparent', border: '0.5px solid rgba(255,255,255,0.12)', padding: '5px 12px', borderRadius: '20px', fontFamily: 'DM Sans,sans-serif' }}>end session</button>
          </div>
        </nav>

        <div style={{ display: 'flex', gap: '22px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 640px', minWidth: '320px' }}>
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>question {qIndex + 1} of {questions.length}</span>
                <span style={{ fontSize: '12px', fontWeight: 500, color: meta.color }}>{correct} correct out of {answered} answered</span>
              </div>
              <div style={{ height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: pct + '%', background: meta.color, borderRadius: '2px', transition: 'width .5s ease' }} />
              </div>
            </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '.875rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '10px', fontWeight: 500, padding: '3px 10px', borderRadius: '20px', background: meta.color + '20', border: `0.5px solid ${meta.color}44`, color: meta.color }}>{section} · {meta.constellation}</span>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', padding: '3px 8px', borderRadius: '20px', background: 'rgba(255,255,255,0.05)' }}>{q.difficulty} · target {formatDifficultyBand(targetDifficulty)}</span>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.55)', padding: '3px 8px', borderRadius: '20px', background: 'rgba(255,255,255,0.05)' }}>question timer {formatTime(questionElapsedSeconds)}</span>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.55)', padding: '3px 8px', borderRadius: '20px', background: 'rgba(255,255,255,0.05)' }}>ai hints {questionHintCount}</span>
              {officialCategory && <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.55)', padding: '3px 8px', borderRadius: '20px', background: 'rgba(255,255,255,0.05)' }}>{officialCategory}</span>}
            </div>
            {q.passage && (
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.06em', color: 'rgba(255,255,255,0.38)', marginBottom: '8px' }}>
                  PASSAGE / SETUP
                </div>
                <div style={{ fontSize: '15px', lineHeight: 1.85, color: 'rgba(255,255,255,0.84)', whiteSpace: 'pre-wrap', maxWidth: '780px' }}>
                  {renderFormattedText(q.passage)}
                </div>
                <div style={{ height: '1px', background: 'linear-gradient(90deg, rgba(255,255,255,0.16), rgba(255,255,255,0))', marginTop: '16px' }} />
              </div>
            )}

            <div
              style={{
                marginBottom: '1.5rem',
              }}
            >
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  letterSpacing: '.08em',
                  color: meta.color,
                  marginBottom: '10px',
                  textTransform: 'uppercase',
                }}
              >
                Question
              </div>
              <div
                style={{
                  fontFamily: 'DM Serif Display,serif',
                  fontSize: 'clamp(1.28rem, 2.2vw, 1.72rem)',
                  lineHeight: 1.65,
                  color: '#ffffff',
                  textWrap: 'pretty',
                  maxWidth: '820px',
                  textShadow: '0 8px 30px rgba(0,0,0,0.18)',
                }}
              >
                {renderFormattedText(q.question_text)}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '1rem' }}>
              {(['A', 'B', 'C', 'D'] as const).map(letter => {
                let bg = 'rgba(255,255,255,0.03)';
                let borderColor = 'rgba(255,255,255,0.1)';
                let letterBg = 'transparent';
                let letterBorder = 'rgba(255,255,255,0.15)';
                let letterColor = 'rgba(255,255,255,0.7)';
                let opacity = 1;

                if (submitted) {
                  if (letter === q.correct_answer) {
                    bg = 'rgba(93,202,165,0.1)'; borderColor = '#5DCAA5';
                    letterBg = '#5DCAA5'; letterBorder = '#5DCAA5'; letterColor = '#0a1208';
                  } else if (letter === picked) {
                    bg = 'rgba(240,153,123,0.1)'; borderColor = '#F0997B';
                    letterBg = '#F0997B'; letterBorder = '#F0997B'; letterColor = '#fff';
                  } else { opacity = 0.3; }
                } else if (letter === picked) {
                  bg = 'rgba(255,255,255,0.08)'; borderColor = 'rgba(255,255,255,0.35)';
                  letterBg = 'rgba(255,255,255,0.15)'; letterBorder = 'rgba(255,255,255,0.4)';
                }

                return (
                  <div key={letter} onClick={() => handlePick(letter)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '12px', border: `0.5px solid ${borderColor}`, background: bg, cursor: submitted ? 'default' : 'pointer', opacity, transition: 'all .15s' }}>
                    <div style={{ width: '26px', height: '26px', borderRadius: '7px', border: `0.5px solid ${letterBorder}`, background: letterBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 500, color: letterColor, flexShrink: 0, transition: 'all .15s' }}>{letter}</div>
                    <div style={{ fontSize: '13px', lineHeight: 1.45, color: 'rgba(255,255,255,0.82)' }}>{renderFormattedText(q.choices[letter])}</div>
                  </div>
                );
              })}
            </div>

            {!submitted && (
              <button onClick={handleSubmit} disabled={!picked} style={{ width: '100%', padding: '12px', borderRadius: '12px', fontSize: '13px', fontWeight: 500, cursor: picked ? 'pointer' : 'default', border: 'none', background: picked ? '#1D9E75' : 'rgba(255,255,255,0.08)', color: picked ? '#fff' : 'rgba(255,255,255,0.35)', fontFamily: 'DM Sans,sans-serif', transition: 'all .2s', marginBottom: '1rem' }}>
                {picked ? 'submit answer' : 'select an answer to submit'}
              </button>
            )}

            {submitted && (
              <div style={{ borderRadius: '12px', padding: '12px 14px', marginBottom: '1rem', borderLeft: `2px solid ${picked === q.correct_answer ? '#5DCAA5' : '#F0997B'}`, background: picked === q.correct_answer ? 'rgba(93,202,165,0.08)' : 'rgba(240,153,123,0.08)', color: 'rgba(255,255,255,0.7)', fontSize: '13px', lineHeight: 1.65 }}>
              <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.06em', marginBottom: '5px', color: picked === q.correct_answer ? '#5DCAA5' : '#F0997B' }}>
                  {picked === q.correct_answer ? `why ${q.correct_answer} is correct` : 'almost there — here\'s the key fix'}
                </div>
                {q.explanation}
              </div>
            )}

            {submitted && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => void handleNext()} style={{ flex: 1, padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', border: 'none', background: picked === q.correct_answer ? meta.color : 'rgba(255,255,255,0.08)', color: picked === q.correct_answer ? '#0a1208' : 'rgba(255,255,255,0.7)', fontFamily: 'DM Sans,sans-serif' }}>
                  {qIndex + 1 >= questions.length ? 'see results →' : 'next question →'}
                </button>
              </div>
            )}
          </div>

          <div style={{ flex: '0 0 340px', width: '340px', maxWidth: '100%', position: 'sticky', top: '1.25rem', alignSelf: 'flex-start' }}>
            <div style={{ borderRadius: '16px', border: '0.5px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.03)', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.18), 0 0 28px rgba(255,255,255,0.08)', marginBottom: '12px' }}>
              <div style={{ padding: '12px 14px', borderBottom: '0.5px solid rgba(255,255,255,0.07)', fontSize: '11px', color: 'rgba(255,255,255,0.42)', letterSpacing: '.05em', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: meta.color }} />
                  AI tutor
                </div>
                <span style={{ color: 'rgba(255,255,255,0.28)' }}>{topic || 'practice'}</span>
              </div>

              <div ref={msgsRef} style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '360px', maxHeight: '520px', overflowY: 'auto' }}>
                {aiMessages.map((m, i) => (
                  <div key={i} style={{ fontSize: '12px', lineHeight: 1.6, padding: '8px 10px', borderRadius: '10px', background: m.role === 'bot' ? 'rgba(93,202,165,0.08)' : 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.72)', alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '92%' }}>{m.text}</div>
                ))}
                {aiLoading && <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', padding: '8px 10px' }}>thinking...</div>}
                {!submitted && aiMessages.length <= 1 && (
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.32)', lineHeight: 1.6 }}>
                    try asking:
                    <br />
                    &quot;give me a hint&quot;
                    <br />
                    &quot;why is B wrong?&quot;
                    <br />
                    &quot;explain this more simply&quot;
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', padding: '12px 14px', borderTop: '0.5px solid rgba(255,255,255,0.07)' }}>
                <input value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendAI()} placeholder="ask the tutor anything..." style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: '20px', padding: '8px 12px', fontSize: '12px', color: '#fff', outline: 'none', fontFamily: 'DM Sans,sans-serif' }} />
                <button onClick={sendAI} style={{ width: '30px', height: '30px', borderRadius: '50%', background: meta.color, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 6h10M6 1l5 5-5 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.66)', padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', borderLeft: `2px solid ${adaptiveToneColor}` }}>
              <div style={{ fontSize: '10px', letterSpacing: '.06em', textTransform: 'uppercase', color: adaptiveToneColor, marginBottom: '4px' }}>
                {adaptiveStatus.label}
              </div>
              {adaptiveStatus.description}
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

export default function Practice() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            background: "#060d1e",
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.4)",
            fontFamily: "DM Sans,sans-serif",
          }}
        >
          loading questions...
        </div>
      }
    >
      <PracticeContent />
    </Suspense>
  );
}
