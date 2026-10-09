"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./confirmed.module.css";

const REFRESH_INTERVAL_MS = 3_000;
const TIMEOUT_MS = 30_000;

export default function WaitingForPayment() {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      router.refresh();
    }, REFRESH_INTERVAL_MS);

    const timeout = window.setTimeout(() => {
      window.clearInterval(interval);
      setTimedOut(true);
    }, TIMEOUT_MS);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [router]);

  return (
    <main className={styles.waitingShell}>
      <div className={styles.waitingCard} role="status" aria-live="polite">
        {!timedOut ? (
          <>
            <span className={styles.spinnerDot} aria-hidden="true" />
            <p>finishing up your payment…</p>
          </>
        ) : (
          <>
            <p>This is taking longer than usual. Refresh the page, or contact us.</p>
            <button
              type="button"
              className={styles.refreshButton}
              onClick={() => {
                setTimedOut(false);
                router.refresh();
                window.location.reload();
              }}
            >
              refresh
            </button>
          </>
        )}
      </div>
    </main>
  );
}
