"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NEXT_MOCK } from "@/lib/mockTests";
import styles from "./MockTestBanner.module.css";

const STORAGE_KEY = `aced-mock-banner-dismissed-${NEXT_MOCK.testDate}`;

type RegistrationStatus = {
  paid?: boolean;
  finished?: boolean;
  released?: boolean;
  localReleaseTime?: string;
};

type PublicSeatStatus = {
  isFull?: boolean;
  label?: "limited" | "only" | "almost_full" | "full";
  remaining?: number | null;
  text?: string;
};

export default function MockTestBanner() {
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<RegistrationStatus>({});
  const [seatStatus, setSeatStatus] = useState<PublicSeatStatus>({});

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/mock-test/seats", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : {}))
      .then((data: PublicSeatStatus) => {
        if (!cancelled) setSeatStatus(data);
      })
      .catch(() => {
        if (!cancelled) setSeatStatus({});
      });

    void fetch("/api/mock-test/registration-status", { cache: "no-store" })
      .then((response) =>
        response.ok
          ? response.json()
          : { paid: false, finished: false, released: false }
      )
      .then((data: RegistrationStatus) => {
        if (cancelled) return;
        setStatus(data);

        const now = new Date();
        const endOfTestDay = new Date(`${NEXT_MOCK.testDate}T23:59:59.999`);

        if (data.finished) {
          setVisible(true);
          return;
        }

        if (now > endOfTestDay) {
          setVisible(false);
          return;
        }

        try {
          if (window.localStorage.getItem(STORAGE_KEY) === "1") {
            setVisible(false);
            return;
          }
        } catch {
          // localStorage can be unavailable in private/restricted browser modes.
        }

        setVisible(true);
      })
      .catch(() => {
        if (!cancelled) setVisible(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    if (status.finished) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Dismissal still works for the current page even if storage is unavailable.
    }
  };

  if (!visible) return null;

  const paid = Boolean(status.paid);
  const finished = Boolean(status.finished);
  const released = Boolean(status.released);

  const href = finished
    ? released
      ? "/mock-test/results"
      : "/mock-test/run/finished"
    : paid
      ? "/mock-test/confirmed"
      : "/mock-test";

  const label = finished
    ? released
      ? "scores are ready ✦"
      : `✦ test submitted · scores Sun at ${status.localReleaseTime ?? NEXT_MOCK.resultsLabel}`
    : paid
      ? `you’re in for the ACED Mock Test · ${NEXT_MOCK.testDateShort}`
      : `the ACED Mock Test · ${NEXT_MOCK.testDateLabel}`;

  return (
    <aside className={styles.banner} aria-label="ACED Mock Test announcement">
      <div className={styles.copy}>
        <div className={styles.primary}>
          <span className={styles.twinkleDot} aria-hidden="true" />
          <span>{label}</span>
        </div>

        {!paid ? (
          <div className={styles.secondary}>
            full timed ACT · scores {NEXT_MOCK.resultsLabel.replace(",", "")}
            {seatStatus.text ? ` · ${seatStatus.text}` : ""}
          </div>
        ) : null}
      </div>

      <Link href={href} className={styles.cta}>
        {finished ? (released ? "see results" : "view") : paid ? "view ticket" : `save my seat · $${NEXT_MOCK.priceUsd}`}
      </Link>

      <button
        type="button"
        className={styles.close}
        onClick={dismiss}
        aria-label="Dismiss mock test banner"
      >
        ×
      </button>
    </aside>
  );
}
