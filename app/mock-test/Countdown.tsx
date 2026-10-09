"use client";

import { useEffect, useState } from "react";
import styles from "./mock-test.module.css";

interface CountdownProps {
  testDate?: string;
}

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  isPast: boolean;
}

export default function Countdown({ testDate = "2026-12-05" }: CountdownProps) {
  // Use null on server & initial client render to strictly avoid hydration mismatch
  const [timeLeft, setTimeLeft] = useState<TimeRemaining | null>(null);

  useEffect(() => {
    // Target midnight in the visitor's local time zone on the given date
    const targetDate = new Date(`${testDate}T00:00:00`);

    const computeTime = () => {
      const now = new Date();
      const diffMs = targetDate.getTime() - now.getTime();

      if (diffMs <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, isPast: true });
        return;
      }

      const totalSeconds = Math.floor(diffMs / 1000);
      const days = Math.floor(totalSeconds / (3600 * 24));
      const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);

      setTimeLeft({ days, hours, minutes, isPast: false });
    };

    computeTime();
    const interval = setInterval(computeTime, 30000); // update every 30 seconds

    return () => clearInterval(interval);
  }, [testDate]);

  return (
    <div className={styles.countdownContainer} aria-label="Countdown to mock test">
      <div className={styles.countdownBox}>
        <span className={styles.countdownValue}>
          {timeLeft !== null ? timeLeft.days : "–"}
        </span>
        <span className={styles.countdownLabel}>days</span>
      </div>
      <span className={styles.countdownDivider}>·</span>
      <div className={styles.countdownBox}>
        <span className={styles.countdownValue}>
          {timeLeft !== null ? timeLeft.hours : "–"}
        </span>
        <span className={styles.countdownLabel}>hours</span>
      </div>
      <span className={styles.countdownDivider}>·</span>
      <div className={styles.countdownBox}>
        <span className={styles.countdownValue}>
          {timeLeft !== null ? timeLeft.minutes : "–"}
        </span>
        <span className={styles.countdownLabel}>min</span>
      </div>
    </div>
  );
}
