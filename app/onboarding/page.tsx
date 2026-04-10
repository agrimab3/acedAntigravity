"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import {
  ACT_TEST_DATES_SOURCE_URL,
  ONBOARDING_GRADE_OPTIONS,
  ONBOARDING_TEST_DATE_OPTIONS,
} from "@/lib/onboarding";
import { useOnboardingState } from "@/lib/use-onboarding-state";

const ONBOARDING_BACKGROUND =
  "radial-gradient(circle at 18% 16%, rgba(74, 128, 178, 0.12), transparent 32%), radial-gradient(circle at 74% 24%, rgba(88, 138, 188, 0.08), transparent 34%), radial-gradient(circle at 52% 72%, rgba(120, 136, 182, 0.06), transparent 40%), linear-gradient(180deg,#0d1b2a 0%,#081221 44%,#020408 100%)";

export default function OnboardingPage() {
  const router = useRouter();
  const { status } = useSession();
  const { data, loading } = useOnboardingState(status, {
    redirectIfCompleteTo: "/dashboard",
  });
  const [preferredName, setPreferredName] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [actTestDate, setActTestDate] = useState("");
  const [previousActScore, setPreviousActScore] = useState("");
  const [hasRecommendations, setHasRecommendations] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [didHydrate, setDidHydrate] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [router, status]);

  useEffect(() => {
    if (!data || didHydrate) {
      return;
    }

    setPreferredName(
      data.profile.preferredName?.trim() ||
        data.profile.googleName?.split(/\s+/)[0] ||
        ""
    );
    setGradeLevel(data.profile.gradeLevel ?? "");
    setActTestDate(data.profile.actTestDate ?? "");
    setPreviousActScore(
      data.profile.previousActScore === null ? "" : String(data.profile.previousActScore)
    );
    setHasRecommendations(data.profile.hasRecommendations);
    setDidHydrate(true);
  }, [data, didHydrate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const normalizedPreviousActScore =
      previousActScore.trim() === "" ? null : Number.parseInt(previousActScore, 10);

    if (
      normalizedPreviousActScore !== null &&
      (!Number.isInteger(normalizedPreviousActScore) ||
        normalizedPreviousActScore < 1 ||
        normalizedPreviousActScore > 36)
    ) {
      setError("Previous ACT score should be a whole number between 1 and 36.");
      return;
    }

    if (hasRecommendations === null) {
      setError("Let us know whether you already have recs.");
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          preferredName,
          gradeLevel,
          actTestDate,
          previousActScore: normalizedPreviousActScore,
          hasRecommendations,
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

  if (status === "loading" || loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: ONBOARDING_BACKGROUND,
          color: "rgba(255,255,255,0.54)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "DM Sans, sans-serif",
        }}
      >
        building your universe...
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: ONBOARDING_BACKGROUND,
        color: "#fff",
        fontFamily: "DM Sans, sans-serif",
        padding: "2rem 1.25rem 3rem",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500;700&display=swap"
        rel="stylesheet"
      />

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "-8rem",
          left: "-6rem",
          width: "24rem",
          height: "24rem",
          borderRadius: "999px",
          background: "radial-gradient(circle, rgba(93, 202, 165, 0.16), rgba(93, 202, 165, 0) 68%)",
          filter: "blur(24px)",
          pointerEvents: "none",
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          right: "-10rem",
          bottom: "-8rem",
          width: "28rem",
          height: "28rem",
          borderRadius: "999px",
          background: "radial-gradient(circle, rgba(175, 169, 236, 0.18), rgba(175, 169, 236, 0) 70%)",
          filter: "blur(28px)",
          pointerEvents: "none",
        }}
      />

      <div style={{ maxWidth: "1080px", margin: "0 auto", position: "relative", zIndex: 1 }}>
        <div
          style={{
            display: "grid",
            gap: "1.5rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            alignItems: "start",
          }}
        >
          <section
            style={{
              padding: "2rem",
              borderRadius: "30px",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "linear-gradient(180deg, rgba(7,16,30,0.9), rgba(5,10,20,0.78))",
              boxShadow: "0 24px 80px rgba(0,0,0,0.24)",
            }}
          >
            <div style={{ fontSize: "12px", letterSpacing: ".14em", color: "rgba(255,255,255,0.42)" }}>
              YOUR UNIVERSE
            </div>
            <h1
              style={{
                margin: "0.55rem 0 1rem",
                fontFamily: "DM Serif Display, serif",
                fontWeight: 400,
                fontSize: "clamp(2.3rem, 4vw, 3.6rem)",
                lineHeight: 1.08,
              }}
            >
              let&apos;s map your ACT starting point
            </h1>
            <p
              style={{
                margin: 0,
                maxWidth: "34rem",
                lineHeight: 1.7,
                color: "rgba(255,255,255,0.66)",
                fontSize: "15px",
              }}
            >
              This only takes a minute. We&apos;ll use it to shape your dashboard, pacing,
              and what Aced recommends first.
            </p>

            <div
              style={{
                marginTop: "1.6rem",
                display: "grid",
                gap: "0.9rem",
              }}
            >
              {[
                "pick your official ACT date or say you're just exploring",
                "save your current score if you already have one",
                "keep the rest lightweight so you can start practicing fast",
              ].map((item) => (
                <div
                  key={item}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.8rem",
                    color: "rgba(255,255,255,0.7)",
                    fontSize: "14px",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: "9px",
                      height: "9px",
                      borderRadius: "999px",
                      background: "#F4F0E8",
                      boxShadow: "0 0 18px rgba(255,255,255,0.48)",
                      flexShrink: 0,
                    }}
                  />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: "1.75rem",
                padding: "1rem 1.05rem",
                borderRadius: "18px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.62)",
                fontSize: "13px",
                lineHeight: 1.6,
              }}
            >
              ACT dates come from the official national test schedule.{" "}
              <a
                href={data?.actDatesSourceUrl ?? ACT_TEST_DATES_SOURCE_URL}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#9ED0FF" }}
              >
                view the official source
              </a>
              .
            </div>
          </section>

          <section
            style={{
              padding: "1.6rem",
              borderRadius: "30px",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "linear-gradient(180deg, rgba(9,18,36,0.92), rgba(6,11,22,0.84))",
              boxShadow: "0 26px 90px rgba(0,0,0,0.24)",
            }}
          >
            <form
              onSubmit={handleSubmit}
              style={{
                display: "grid",
                gap: "1rem",
              }}
            >
              <Field label="what should Aced call you?">
                <input
                  value={preferredName}
                  onChange={(event) => setPreferredName(event.target.value)}
                  placeholder="First name"
                  autoComplete="given-name"
                  maxLength={40}
                  style={inputStyle}
                />
              </Field>

              <Field label="what grade are you in?">
                <select
                  value={gradeLevel}
                  onChange={(event) => setGradeLevel(event.target.value)}
                  style={inputStyle}
                >
                  <option value="">Choose your grade</option>
                  {(data?.gradeOptions ?? ONBOARDING_GRADE_OPTIONS).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="when are you taking the ACT?">
                <select
                  value={actTestDate}
                  onChange={(event) => setActTestDate(event.target.value)}
                  style={inputStyle}
                >
                  <option value="">Pick a test date</option>
                  {(data?.testDateOptions ?? ONBOARDING_TEST_DATE_OPTIONS).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="previous ACT score, if any">
                <input
                  value={previousActScore}
                  onChange={(event) => setPreviousActScore(event.target.value.replace(/[^\d]/g, ""))}
                  placeholder="Optional"
                  inputMode="numeric"
                  maxLength={2}
                  style={inputStyle}
                />
              </Field>

              <Field label="do you have recs?">
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                  {[
                    { label: "Yes", value: true },
                    { label: "No", value: false },
                  ].map((option) => {
                    const active = hasRecommendations === option.value;

                    return (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => setHasRecommendations(option.value)}
                        style={{
                          padding: "0.85rem 1rem",
                          minWidth: "110px",
                          borderRadius: "999px",
                          border: active
                            ? "1px solid rgba(157, 240, 214, 0.72)"
                            : "1px solid rgba(255,255,255,0.12)",
                          background: active
                            ? "rgba(29, 158, 117, 0.16)"
                            : "rgba(255,255,255,0.03)",
                          color: active ? "#E8FFF7" : "rgba(255,255,255,0.76)",
                          fontSize: "14px",
                          cursor: "pointer",
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </Field>

              {error ? (
                <div
                  style={{
                    marginTop: "0.2rem",
                    padding: "0.9rem 1rem",
                    borderRadius: "16px",
                    border: "1px solid rgba(240, 153, 123, 0.36)",
                    background: "rgba(240, 153, 123, 0.08)",
                    color: "#FFD7CB",
                    fontSize: "13px",
                  }}
                >
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={saving}
                style={{
                  marginTop: "0.4rem",
                  padding: "1rem 1.2rem",
                  borderRadius: "999px",
                  border: "1px solid rgba(93,202,165,0.28)",
                  background: "linear-gradient(180deg, rgba(29,158,117,0.94), rgba(20,123,91,0.94))",
                  color: "#F7FFFC",
                  fontSize: "15px",
                  fontWeight: 600,
                  cursor: saving ? "progress" : "pointer",
                  boxShadow: "0 16px 40px rgba(11, 52, 40, 0.4)",
                  opacity: saving ? 0.8 : 1,
                }}
              >
                {saving ? "saving your profile..." : "enter your universe"}
              </button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}

function Field(props: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: "0.55rem" }}>
      <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.72)" }}>{props.label}</span>
      {props.children}
    </label>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  borderRadius: "18px",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.04)",
  color: "#fff",
  padding: "0.95rem 1rem",
  fontSize: "15px",
  outline: "none",
  appearance: "none",
};
