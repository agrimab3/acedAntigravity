"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SeatCounter from "@/components/SeatCounter";
import {
  MOCK_SECTIONS,
  NEXT_MOCK,
  TIME_ZONES,
  TOTAL_MINUTES,
  TOTAL_QUESTIONS,
  formatDuration,
  getMockTimeZoneDisplay,
  isMockSignupClosedForZone,
} from "@/lib/mockTests";
import styles from "./signup.module.css";

type SignupUser = {
  email: string;
  name: string | null;
  initial: string;
} | null;

type SignupFormProps = {
  user: SignupUser;
  canceled: boolean;
  authMode: "test" | "google";
  paymentMode: "test" | "stripe";
  signInHref: string;
  signOutHref: string;
  seatStatus: {
    limit: number;
    remaining: number;
    isFull: boolean;
  };
  inviteToken?: string;
  invited?: boolean;
};

type SavedSignupState = {
  timeZone?: string;
  agreedNoRefund?: boolean;
  marketingOptIn?: boolean;
};

const STORAGE_KEY = `aced-mock-signup-${NEXT_MOCK.mockTestSlug}`;

function getOffsetMinutes(timeZone: string, instant: Date) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    }).formatToParts(instant);
    const offset = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
    if (offset === "GMT") return 0;
    const match = offset.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!match) return null;
    const sign = match[1] === "-" ? -1 : 1;
    const hours = Number(match[2]);
    const minutes = Number(match[3] ?? "0");
    return sign * (hours * 60 + minutes);
  } catch {
    return null;
  }
}

function getDefaultTimeZone() {
  const pacific = TIME_ZONES[0].value;
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (TIME_ZONES.some((zone) => zone.value === detected)) {
      return detected;
    }

    const reference = new Date(`${NEXT_MOCK.testDate}T12:00:00Z`);
    const detectedOffset = getOffsetMinutes(detected, reference);
    if (detectedOffset !== null) {
      const match = TIME_ZONES.find(
        (zone) => getOffsetMinutes(zone.value, reference) === detectedOffset
      );
      if (match) return match.value;
    }
  } catch {
    // Fall through to Pacific.
  }
  return pacific;
}

export default function SignupForm({
  user,
  canceled,
  authMode,
  paymentMode,
  signInHref,
  signOutHref,
  seatStatus,
  inviteToken,
  invited = false,
}: SignupFormProps) {
  const [timeZone, setTimeZone] = useState(TIME_ZONES[0].value);
  const [agreedNoRefund, setAgreedNoRefund] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [closed, setClosed] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  useEffect(() => {
    let saved: SavedSignupState | null = null;
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw) saved = JSON.parse(raw) as SavedSignupState;
    } catch {
      saved = null;
    }

    const restoredZone =
      saved?.timeZone && TIME_ZONES.some((zone) => zone.value === saved?.timeZone)
        ? saved.timeZone
        : getDefaultTimeZone();

    const reveal = window.setTimeout(() => {
      setTimeZone(restoredZone);
      setAgreedNoRefund(Boolean(saved?.agreedNoRefund));
      setMarketingOptIn(Boolean(saved?.marketingOptIn));
      setClosed(isMockSignupClosedForZone(restoredZone));
      setHydrated(true);
    }, 0);

    return () => window.clearTimeout(reveal);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ timeZone, agreedNoRefund, marketingOptIn })
      );
    } catch {
      // The form still works when sessionStorage is unavailable.
    }
  }, [timeZone, agreedNoRefund, marketingOptIn, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const updateClosed = () => setClosed(isMockSignupClosedForZone(timeZone));
    updateClosed();
    const interval = window.setInterval(updateClosed, 60_000);
    return () => window.clearInterval(interval);
  }, [timeZone, hydrated]);

  const zoneDisplay = useMemo(() => getMockTimeZoneDisplay(timeZone), [timeZone]);
  const canContinue = Boolean(user && agreedNoRefund && !closed && !checkoutBusy);

  const saveBeforeAuth = () => {
    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ timeZone, agreedNoRefund, marketingOptIn })
      );
    } catch {
      // No-op when storage is unavailable.
    }
  };

  const handleSignIn = () => {
    saveBeforeAuth();
    window.location.assign(signInHref);
  };

  const handleSwitch = () => {
    saveBeforeAuth();
    window.location.assign(signOutHref);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canContinue) return;

    setCheckoutBusy(true);
    setCheckoutError("");

    try {
      const response = await fetch("/api/mock-test/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeZone,
          agreedNoRefund,
          marketingOptIn,
          inviteToken,
        }),
      });
      const data = (await response.json()) as { url?: string; error?: string; code?: string };

      if (!response.ok) {
        if (data.code === "SEATS_FULL" && data.url) {
          window.location.assign(data.url);
          return;
        }
        throw new Error(data.error || "Could not start checkout.");
      }

      if (!data.url) {
        throw new Error(data.error || "Could not start checkout.");
      }

      window.location.assign(data.url);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Could not start checkout.");
      setCheckoutBusy(false);
    }
  };

  if (!hydrated) {
    return <div className={styles.loadingCard}>loading your ticket…</div>;
  }

  if (closed) {
    return (
      <section className={styles.closedCard}>
        <span className={styles.closedEyebrow}>ACED MOCK TEST</span>
        <h2>signups for Dec 5 are closed</h2>
        <p>the next mock test is {NEXT_MOCK.nextTestDateLabel}</p>
        <Link href="/mock-test" className={styles.closedLink}>
          ← back to the mock test
        </Link>
      </section>
    );
  }

  return (
    <div className={styles.signupArea}>
      {invited ? (
        <div className={styles.inviteNotice} role="status">
          ✦ you&apos;re off the waitlist. Your spot is saved.
        </div>
      ) : null}

      {canceled ? (
        <div className={styles.canceledNotice} role="status">
          Payment canceled. Your seat isn&apos;t saved yet.
        </div>
      ) : null}

      <section className={styles.card}>
        <form id="mock-signup-form" className={styles.formPanel} onSubmit={handleSubmit}>
          <div className={styles.accountRow}>
            {user ? (
              <>
                <div className={styles.accountIdentity}>
                  <div className={styles.initialCircle} aria-hidden="true">
                    {user.initial}
                  </div>
                  <div>
                    <div className={styles.accountTitle}>{authMode === "test" ? "signed in · test student" : "signed in with Google"}</div>
                    <div className={styles.accountEmail}>{user.email}</div>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.switchButton}
                  onClick={handleSwitch}
                >
                  switch
                </button>
              </>
            ) : (
              <div className={styles.signInBlock}>
                <button
                  type="button"
                  className={styles.googleButton}
                  onClick={handleSignIn}
                >
                  {authMode === "test" ? "continue with Google · test" : "continue with Google"}
                </button>
              </div>
            )}
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="mock-time-zone" className={styles.fieldLabel}>
              where are you testing from?
            </label>
            <div className={styles.selectWrap}>
              <select
                id="mock-time-zone"
                className={styles.select}
                value={timeZone}
                onChange={(event) => setTimeZone(event.target.value)}
              >
                {TIME_ZONES.map((zone) => (
                  <option key={zone.value} value={zone.value}>
                    {zone.label}
                  </option>
                ))}
              </select>
              <svg
                className={styles.chevron}
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
              >
                <path d="m5 7.5 5 5 5-5" stroke="#5DCAA5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className={styles.helperText}>
              We guessed from your device. This locks once you pay.
            </p>
          </div>

          <div className={styles.checkboxStack}>
            <label
              className={`${styles.checkboxCard} ${agreedNoRefund ? styles.checkboxChecked : ""}`}
            >
              <input
                type="checkbox"
                checked={agreedNoRefund}
                onChange={(event) => setAgreedNoRefund(event.target.checked)}
              />
              <span>
                I understand this test is <strong>non-refundable</strong> and only open on{" "}
                {NEXT_MOCK.testDateLabel}
              </span>
            </label>

            <label className={styles.checkboxCard}>
              <input
                type="checkbox"
                checked={marketingOptIn}
                onChange={(event) => setMarketingOptIn(event.target.checked)}
              />
              <span>Send me future mock test dates and ACT tips</span>
            </label>
          </div>

          <span id="mock-pay-hint" className={styles.srOnly}>
            Sign in and tick the non-refund box to continue.
          </span>
        </form>

        <aside className={styles.ticketPanel} aria-label="Your mock test ticket">
          <div className={styles.ticketEyebrow}>YOUR TICKET</div>

          <div>
            <h2 className={styles.ticketDate}>{NEXT_MOCK.testDateShort}</h2>
            <p className={styles.ticketSummary}>
              full ACT · {TOTAL_QUESTIONS} questions · {formatDuration(TOTAL_MINUTES)}
            </p>
          </div>

          <div className={styles.sectionStrip}>
            <div className={styles.dots} aria-hidden="true">
              {MOCK_SECTIONS.map((section) => (
                <span
                  key={section.key}
                  className={styles.sectionDot}
                  style={{
                    background: section.color,
                    boxShadow: `0 0 12px ${section.color}`,
                  }}
                />
              ))}
            </div>
            <div className={styles.sectionNames}>english · math · reading · science</div>
          </div>

          <div className={styles.dashedDivider} />

          <dl className={styles.ticketRows}>
            <div>
              <dt>opens</dt>
              <dd>12:00 AM {zoneDisplay.shortLabel}</dd>
            </div>
            <div>
              <dt>start by</dt>
              <dd>9:00 PM {zoneDisplay.shortLabel}</dd>
            </div>
            <div>
              <dt>scores out</dt>
              <dd className={styles.releaseValue}>Sun, {zoneDisplay.localReleaseTime}</dd>
            </div>
          </dl>

          <div className={styles.dashedDivider} />

          <div className={styles.totalRow}>
            <span>total</span>
            <strong>${NEXT_MOCK.priceUsd}</strong>
          </div>

          {!invited ? (
            <SeatCounter
              limit={seatStatus.limit}
              remaining={seatStatus.remaining}
              isFull={seatStatus.isFull}
              align="left"
            />
          ) : null}

          <button
            type="submit"
            form="mock-signup-form"
            className={styles.payButton}
            disabled={!canContinue}
            aria-describedby={!canContinue ? "mock-pay-hint" : undefined}
            onClick={(event) => {
              if (!canContinue) event.preventDefault();
            }}
          >
            {checkoutBusy ? "opening checkout…" : "pay & save my seat ✦"}
          </button>

          {checkoutError ? (
            <p className={styles.checkoutError} role="alert">
              {checkoutError}
            </p>
          ) : null}

          <p className={styles.stripeCopy}>
            {paymentMode === "test" ? "test checkout · no real charge" : "secure checkout with Stripe"}
          </p>
        </aside>
      </section>
    </div>
  );
}
