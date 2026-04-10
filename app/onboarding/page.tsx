"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { CSSProperties, ReactNode } from "react";
import {
  ACT_TEST_DATE_OPTIONS,
  ACT_TEST_DATES_SOURCE_URL,
} from "@/lib/onboarding";
import { useOnboardingState } from "@/lib/use-onboarding-state";

const ONBOARDING_BACKGROUND =
  "radial-gradient(circle at 18% 16%, rgba(74, 128, 178, 0.12), transparent 32%), radial-gradient(circle at 74% 24%, rgba(88, 138, 188, 0.08), transparent 34%), radial-gradient(circle at 52% 72%, rgba(120, 136, 182, 0.06), transparent 40%), linear-gradient(180deg,#0d1b2a 0%,#081221 44%,#020408 100%)";

const STEP_ACCENTS = ["#5DCAA5", "#AFA9EC", "#EF9F27", "#F0997B"] as const;

const GRADE_OPTIONS = [
  { label: "Freshman", value: "9", accent: STEP_ACCENTS[0] },
  { label: "Sophomore", value: "10", accent: STEP_ACCENTS[1] },
  { label: "Junior", value: "11", accent: STEP_ACCENTS[2] },
  { label: "Senior", value: "12", accent: STEP_ACCENTS[3] },
] as const;

const TEST_DATE_OPTIONS = [
  { ...ACT_TEST_DATE_OPTIONS.find((option) => option.value === "2026-06-13")!, accent: STEP_ACCENTS[0] },
  { ...ACT_TEST_DATE_OPTIONS.find((option) => option.value === "2026-07-11")!, accent: STEP_ACCENTS[1] },
  { ...ACT_TEST_DATE_OPTIONS.find((option) => option.value === "2026-09-19")!, accent: STEP_ACCENTS[2] },
  { ...ACT_TEST_DATE_OPTIONS.find((option) => option.value === "2026-10-17")!, accent: STEP_ACCENTS[3] },
  { ...ACT_TEST_DATE_OPTIONS.find((option) => option.value === "2026-12-12")!, accent: "#8BB9FF" },
  { label: "I'm not sure yet", value: "not-scheduled", accent: "rgba(255,255,255,0.84)" },
] as const;

type StepIndex = 0 | 1 | 2 | 3;

function clampPercent(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function seededValue(seed: number) {
  const value = Math.sin(seed * 999.913) * 10000;
  return value - Math.floor(value);
}

function buildAmbientStars(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const seed = index + 1;
    const variant = index % 3;
    return {
      id: index,
      left: `${clampPercent(4 + seededValue(seed) * 92, 2, 98)}%`,
      top: `${clampPercent(6 + seededValue(seed + 20) * 88, 4, 96)}%`,
      size: 0.8 + seededValue(seed + 40) * 2.6,
      opacity: 0.08 + seededValue(seed + 60) * 0.36,
      duration: 7 + seededValue(seed + 80) * 10,
      delay: seededValue(seed + 100) * 6,
      animationName:
        variant === 0 ? "onboardingStarFloatA" : variant === 1 ? "onboardingStarFloatB" : "onboardingStarFloatC",
    };
  });
}

function buildAmbientGlows(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const seed = index + 201;
    return {
      id: index,
      left: `${10 + seededValue(seed) * 80}%`,
      top: `${10 + seededValue(seed + 20) * 76}%`,
      size: 120 + seededValue(seed + 40) * 260,
      opacity: 0.04 + seededValue(seed + 60) * 0.08,
      color:
        index % 4 === 0
          ? "rgba(93, 202, 165, 0.16)"
          : index % 4 === 1
            ? "rgba(175, 169, 236, 0.14)"
            : index % 4 === 2
              ? "rgba(239, 159, 39, 0.12)"
              : "rgba(240, 153, 123, 0.12)",
      duration: 18 + seededValue(seed + 80) * 18,
      delay: seededValue(seed + 100) * 7,
    };
  });
}

export default function OnboardingPage() {
  const router = useRouter();
  const { status } = useSession();
  const { data, loading } = useOnboardingState(status, {
    redirectIfCompleteTo: "/dashboard",
  });

  const [step, setStep] = useState<StepIndex>(0);
  const [preferredName, setPreferredName] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [actTestDate, setActTestDate] = useState("");
  const [previousActScore, setPreviousActScore] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [didHydrate, setDidHydrate] = useState(false);
  const [transitionKey, setTransitionKey] = useState(0);

  const ambientStars = useMemo(() => buildAmbientStars(72), []);
  const ambientGlows = useMemo(() => buildAmbientGlows(7), []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [router, status]);

  useEffect(() => {
    if (!data || didHydrate) {
      return;
    }

    const savedPreferredName = data.profile.preferredName?.trim() || "";
    const hydratedName = savedPreferredName || data.profile.googleName?.split(/\s+/)[0] || "";
    const hydratedGrade = data.profile.gradeLevel ?? "";
    const hydratedDate = data.profile.actTestDate ?? "";
    const hydratedScore =
      data.profile.previousActScore === null ? "" : String(data.profile.previousActScore);

    setPreferredName(hydratedName);
    setGradeLevel(hydratedGrade);
    setActTestDate(hydratedDate);
    setPreviousActScore(hydratedScore);

    let nextStep: StepIndex = 0;
    if (savedPreferredName) nextStep = 1;
    if (savedPreferredName && hydratedGrade) nextStep = 2;
    if (savedPreferredName && hydratedGrade && hydratedDate) nextStep = 3;

    setStep(nextStep);
    setTransitionKey(nextStep);
    setDidHydrate(true);
  }, [data, didHydrate]);

  function moveToStep(nextStep: StepIndex) {
    setError(null);
    setStep(nextStep);
    setTransitionKey((current) => current + 1);
  }

  function handleContinueFromName() {
    if (!preferredName.trim()) {
      setError("Tell us what to call you.");
      return;
    }

    moveToStep(1);
  }

  function handleGradeSelect(value: string) {
    setGradeLevel(value);
    setError(null);

    window.setTimeout(() => {
      moveToStep(2);
    }, 220);
  }

  function handleDateSelect(value: string) {
    setActTestDate(value);
    setError(null);

    window.setTimeout(() => {
      moveToStep(3);
    }, 220);
  }

  async function submitOnboarding(scoreOverride?: string) {
    const normalizedName = preferredName.trim();
    const normalizedScoreValue = (scoreOverride ?? previousActScore).trim();
    const normalizedPreviousActScore =
      normalizedScoreValue === "" ? null : Number.parseInt(normalizedScoreValue, 10);

    if (!normalizedName) {
      moveToStep(0);
      setError("Tell us what to call you.");
      return;
    }

    if (!gradeLevel) {
      moveToStep(1);
      setError("Pick your grade.");
      return;
    }

    if (!actTestDate) {
      moveToStep(2);
      setError("Pick your ACT timing.");
      return;
    }

    if (
      normalizedPreviousActScore !== null &&
      (!Number.isInteger(normalizedPreviousActScore) ||
        normalizedPreviousActScore < 1 ||
        normalizedPreviousActScore > 36)
    ) {
      setError("Previous ACT score should be a whole number between 1 and 36.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          preferredName: normalizedName,
          gradeLevel,
          actTestDate,
          previousActScore: normalizedPreviousActScore,
          hasRecommendations: false,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "We couldn't save your profile yet.");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (submitError) {
      console.error("Failed to save onboarding profile", submitError);
      setError("We couldn't save your profile yet.");
    } finally {
      setSaving(false);
    }
  }

  function handleSkipScore() {
    setPreviousActScore("");
    void submitOnboarding("");
  }

  if (status === "loading" || loading) {
    return (
      <div style={loadingPageStyle}>
        building your universe...
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  const progressWidth = `${((step + 1) / 4) * 100}%`;
  const selectedGrade = gradeLevel;
  const selectedTestDate = actTestDate;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: ONBOARDING_BACKGROUND,
        color: "#fff",
        fontFamily: "DM Sans, sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500;700&display=swap"
        rel="stylesheet"
      />

      <style>{`
        @keyframes onboardingStarFloatA {
          0% { transform: translate3d(0, 0, 0) scale(0.94); opacity: 0.08; }
          50% { transform: translate3d(10px, -12px, 0) scale(1.08); opacity: 0.58; }
          100% { transform: translate3d(0, 0, 0) scale(0.94); opacity: 0.08; }
        }
        @keyframes onboardingStarFloatB {
          0% { transform: translate3d(0, 0, 0) scale(0.92); opacity: 0.1; }
          50% { transform: translate3d(-9px, -8px, 0) scale(1.04); opacity: 0.52; }
          100% { transform: translate3d(0, 0, 0) scale(0.92); opacity: 0.1; }
        }
        @keyframes onboardingStarFloatC {
          0% { transform: translate3d(0, 0, 0) scale(0.9); opacity: 0.08; }
          50% { transform: translate3d(7px, -14px, 0) scale(1.06); opacity: 0.56; }
          100% { transform: translate3d(0, 0, 0) scale(0.9); opacity: 0.08; }
        }
        @keyframes onboardingGlowPulse {
          0% { transform: translate(-50%, -50%) scale(0.96); opacity: 0.34; }
          50% { transform: translate(-50%, -50%) scale(1.06); opacity: 0.72; }
          100% { transform: translate(-50%, -50%) scale(0.96); opacity: 0.34; }
        }
        @keyframes onboardingStepFadeUp {
          0% { opacity: 0; transform: translate3d(0, 18px, 0); }
          100% { opacity: 1; transform: translate3d(0, 0, 0); }
        }
      `}</style>

      <div style={backgroundLayerStyle}>
        {ambientGlows.map((glow) => (
          <span
            key={`glow-${glow.id}`}
            style={{
              position: "absolute",
              left: glow.left,
              top: glow.top,
              width: `${glow.size}px`,
              height: `${glow.size}px`,
              borderRadius: "999px",
              transform: "translate(-50%, -50%)",
              background: `radial-gradient(circle, ${glow.color}, rgba(0,0,0,0) 70%)`,
              filter: "blur(24px)",
              animation: `onboardingGlowPulse ${glow.duration}s ease-in-out ${glow.delay}s infinite`,
            }}
          />
        ))}

        {ambientStars.map((star) => (
          <span
            key={`star-${star.id}`}
            style={{
              position: "absolute",
              left: star.left,
              top: star.top,
              width: `${star.size}px`,
              height: `${star.size}px`,
              borderRadius: "999px",
              background: "#F6F2EA",
              opacity: star.opacity,
              boxShadow: "0 0 12px rgba(255,255,255,0.38)",
              animation: `${star.animationName} ${star.duration}s ease-in-out ${star.delay}s infinite`,
            }}
          />
        ))}
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 1,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          padding: "1.5rem 1.25rem 2rem",
        }}
      >
        <header
          style={{
            width: "min(560px, 100%)",
            margin: "0 auto",
            display: "grid",
            gap: "0.75rem",
            paddingTop: "0.5rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              color: "rgba(255,255,255,0.62)",
              fontSize: "12px",
              letterSpacing: ".12em",
              textTransform: "uppercase",
            }}
          >
            <span>{step + 1} of 4</span>
            {step > 0 ? (
              <button
                type="button"
                onClick={() => moveToStep((step - 1) as StepIndex)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255,255,255,0.58)",
                  cursor: "pointer",
                  fontSize: "12px",
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  padding: 0,
                }}
              >
                back
              </button>
            ) : (
              <span style={{ opacity: 0 }}>back</span>
            )}
          </div>

          <div
            style={{
              height: "2px",
              borderRadius: "999px",
              background: "rgba(255,255,255,0.08)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: progressWidth,
                height: "100%",
                borderRadius: "999px",
                background: "linear-gradient(90deg, rgba(93,202,165,0.92), rgba(175,169,236,0.92), rgba(239,159,39,0.92), rgba(240,153,123,0.92))",
                transition: "width 280ms ease",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
            {[0, 1, 2, 3].map((dot) => (
              <span
                key={`dot-${dot}`}
                style={{
                  width: dot === step ? "28px" : "8px",
                  height: "8px",
                  borderRadius: "999px",
                  background: dot <= step ? STEP_ACCENTS[Math.min(dot, 3)] : "rgba(255,255,255,0.16)",
                  transition: "all 260ms ease",
                  boxShadow:
                    dot === step ? `0 0 18px ${STEP_ACCENTS[Math.min(dot, 3)]}66` : "none",
                }}
              />
            ))}
          </div>
        </header>

        <section
          key={`step-${transitionKey}`}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "onboardingStepFadeUp 420ms ease both",
          }}
        >
          <div
            style={{
              width: "min(760px, 100%)",
              display: "grid",
              justifyItems: "center",
              textAlign: "center",
              gap: "1.25rem",
            }}
          >
            {step === 0 ? (
              <>
                <StepHeading>
                  hi there. <em style={{ fontStyle: "italic", color: "#DFFAF0" }}>what&apos;s your name?</em>
                </StepHeading>
                <input
                  value={preferredName}
                  onChange={(event) => {
                    setPreferredName(event.target.value);
                    setError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleContinueFromName();
                    }
                  }}
                  placeholder="Type your first name"
                  autoComplete="given-name"
                  maxLength={40}
                  style={{
                    ...heroInputStyle,
                    maxWidth: "520px",
                  }}
                />
                <button
                  type="button"
                  onClick={handleContinueFromName}
                  style={primaryButtonStyle}
                >
                  continue →
                </button>
              </>
            ) : null}

            {step === 1 ? (
              <>
                <StepHeading>
                  what grade <em style={{ fontStyle: "italic", color: "#E7E0FF" }}>are you in?</em>
                </StepHeading>
                <div style={pillGridStyle}>
                  {GRADE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleGradeSelect(option.value)}
                      style={getPillStyle(selectedGrade === option.value, option.accent)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <StepHeading>
                  when are you <em style={{ fontStyle: "italic", color: "#FFE4B4" }}>taking the ACT?</em>
                </StepHeading>
                <div style={pillGridStyle}>
                  {TEST_DATE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleDateSelect(option.value)}
                      style={getPillStyle(selectedTestDate === option.value, option.accent)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "12px",
                    color: "rgba(255,255,255,0.48)",
                    lineHeight: 1.6,
                  }}
                >
                  Using the current official ACT U.S. national dates.{" "}
                  <a
                    href={data?.actDatesSourceUrl ?? ACT_TEST_DATES_SOURCE_URL}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#A8D4FF" }}
                  >
                    source
                  </a>
                </p>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <StepHeading>
                  do you have a <em style={{ fontStyle: "italic", color: "#FFD8CF" }}>previous ACT score?</em>
                </StepHeading>
                <div
                  style={{
                    display: "grid",
                    gap: "0.65rem",
                    width: "min(380px, 100%)",
                    justifyItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: "13px",
                      color: "rgba(255,255,255,0.48)",
                      letterSpacing: ".06em",
                      textTransform: "uppercase",
                    }}
                  >
                    optional composite score
                  </span>
                  <input
                    value={previousActScore}
                    onChange={(event) => {
                      setPreviousActScore(event.target.value.replace(/[^\d]/g, ""));
                      setError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void submitOnboarding();
                      }
                    }}
                    placeholder="24"
                    inputMode="numeric"
                    maxLength={2}
                    style={{
                      ...heroInputStyle,
                      width: "100%",
                      textAlign: "center",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void submitOnboarding()}
                    disabled={saving}
                    style={{
                      ...primaryButtonStyle,
                      opacity: saving ? 0.82 : 1,
                      cursor: saving ? "progress" : "pointer",
                    }}
                  >
                    {saving ? "entering your universe..." : "enter my universe →"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSkipScore}
                    disabled={saving}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "rgba(255,255,255,0.5)",
                      fontSize: "13px",
                      cursor: saving ? "default" : "pointer",
                      padding: 0,
                    }}
                  >
                    skip for now
                  </button>
                </div>
              </>
            ) : null}

            {error ? (
              <div
                style={{
                  marginTop: "0.2rem",
                  padding: "0.9rem 1rem",
                  borderRadius: "16px",
                  border: "1px solid rgba(240, 153, 123, 0.34)",
                  background: "rgba(240, 153, 123, 0.08)",
                  color: "#FFD7CB",
                  fontSize: "13px",
                  width: "min(420px, 100%)",
                }}
              >
                {error}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function StepHeading(props: { children: ReactNode }) {
  return (
    <h1
      style={{
        margin: 0,
        fontFamily: "DM Serif Display, serif",
        fontWeight: 400,
        fontSize: "clamp(2.4rem, 5vw, 4.6rem)",
        lineHeight: 1.08,
        letterSpacing: "-0.02em",
        maxWidth: "11ch",
        textWrap: "balance",
      }}
    >
      {props.children}
    </h1>
  );
}

function getPillStyle(active: boolean, accent: string): CSSProperties {
  return {
    width: "100%",
    minHeight: "84px",
    padding: "1.1rem 1.2rem",
    borderRadius: "999px",
    border: active ? `1px solid ${accent}` : "1px solid rgba(255,255,255,0.12)",
    background: active
      ? `linear-gradient(180deg, ${accent}22, ${accent}16)`
      : "rgba(255,255,255,0.035)",
    color: active ? "#FFFDF9" : "rgba(255,255,255,0.84)",
    fontSize: "1rem",
    fontWeight: 500,
    letterSpacing: "-0.01em",
    cursor: "pointer",
    transition: "transform 180ms ease, border-color 180ms ease, background 180ms ease, box-shadow 180ms ease",
    boxShadow: active ? `0 0 0 1px ${accent}20, 0 14px 38px ${accent}1f` : "none",
  };
}

const loadingPageStyle: CSSProperties = {
  minHeight: "100vh",
  background: ONBOARDING_BACKGROUND,
  color: "rgba(255,255,255,0.54)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "DM Sans, sans-serif",
};

const backgroundLayerStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  overflow: "hidden",
};

const heroInputStyle: CSSProperties = {
  width: "100%",
  borderRadius: "28px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.045)",
  color: "#fff",
  padding: "1.15rem 1.35rem",
  fontSize: "clamp(1.2rem, 2vw, 1.6rem)",
  outline: "none",
  boxShadow: "0 18px 60px rgba(0,0,0,0.18)",
  textAlign: "center",
};

const primaryButtonStyle: CSSProperties = {
  padding: "0.98rem 1.3rem",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "#F9FBFF",
  fontSize: "15px",
  fontWeight: 500,
  cursor: "pointer",
  boxShadow: "0 14px 36px rgba(0,0,0,0.18)",
};

const pillGridStyle: CSSProperties = {
  width: "min(760px, 100%)",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "0.9rem",
};
