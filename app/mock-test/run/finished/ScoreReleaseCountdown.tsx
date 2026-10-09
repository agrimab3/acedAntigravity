"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./finished.module.css";

function splitRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { hours, minutes, seconds };
}

export default function ScoreReleaseCountdown({
  releaseAt,
  serverNow,
}: {
  releaseAt: string;
  serverNow: string;
}) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const releaseMs = useMemo(() => new Date(releaseAt).getTime(), [releaseAt]);

  useEffect(() => {
    const serverOffsetMs = new Date(serverNow).getTime() - Date.now();
    const tick = () => {
      setRemainingMs(Math.max(0, releaseMs - (Date.now() + serverOffsetMs)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [releaseMs, serverNow]);

  const parts = remainingMs === null ? null : splitRemaining(remainingMs);
  const released = remainingMs !== null && remainingMs <= 0;

  return (
    <div className={styles.countdownWrap}>
      <div className={styles.countdown} role="timer" aria-label="Time until scores are released">
        <div>
          <strong>{parts ? String(parts.hours).padStart(2, "0") : "--"}</strong>
          <span>hours</span>
        </div>
        <b aria-hidden="true">:</b>
        <div>
          <strong>{parts ? String(parts.minutes).padStart(2, "0") : "--"}</strong>
          <span>min</span>
        </div>
        <b aria-hidden="true">:</b>
        <div>
          <strong>{parts ? String(parts.seconds).padStart(2, "0") : "--"}</strong>
          <span>sec</span>
        </div>
      </div>
      {released ? <div className={styles.scoresOut}>scores are out ✦</div> : null}
    </div>
  );
}
