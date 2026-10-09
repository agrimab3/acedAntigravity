"use client";

import { useMemo, useState } from "react";
import { isMockSignupClosedForZone, NEXT_MOCK, TIME_ZONES } from "@/lib/mockTests";
import styles from "./signup.module.css";

type WaitlistCardProps = {
  user: { email: string } | null;
  initialJoinedEmail?: string | null;
  inviteExpired?: boolean;
};

function getDeviceTimeZone() {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (TIME_ZONES.some((zone) => zone.value === detected)) return detected;
  } catch {
    // Fall through to Pacific.
  }
  return TIME_ZONES[0].value;
}

export default function WaitlistCard({
  user,
  initialJoinedEmail,
  inviteExpired = false,
}: WaitlistCardProps) {
  const [email, setEmail] = useState(user?.email ?? initialJoinedEmail ?? "");
  const [joinedEmail, setJoinedEmail] = useState(initialJoinedEmail ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const timeZone = useMemo(() => getDeviceTimeZone(), []);
  const closed = isMockSignupClosedForZone(timeZone);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || closed) return;
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/mock-test/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, timeZone }),
      });
      const data = (await response.json()) as { joined?: boolean; email?: string; error?: string };
      if (!response.ok || !data.joined || !data.email) {
        throw new Error(data.error || "Could not join the waitlist.");
      }
      setJoinedEmail(data.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the waitlist.");
    } finally {
      setBusy(false);
    }
  };

  if (joinedEmail) {
    return (
      <section className={styles.waitlistCard} aria-live="polite">
        <h1 className={styles.waitlistHeading}>
          you&apos;re on the <em>list</em>
        </h1>
        {inviteExpired ? (
          <p className={styles.waitlistCopy}>
            This invite expired. You&apos;re back on the waitlist and we&apos;ll email you if another spot opens.
          </p>
        ) : (
          <p className={styles.waitlistCopy}>
            We&apos;ll email {joinedEmail} if a spot opens.
          </p>
        )}
        <p className={styles.waitlistFinePrint}>No payment needed to join the waitlist.</p>
      </section>
    );
  }

  return (
    <section className={styles.waitlistCard}>
      <h1 className={styles.waitlistHeading}>
        seats are <em>full</em>
      </h1>
      {inviteExpired ? (
        <p className={styles.waitlistCopy}>
          This invite expired. You&apos;re back on the waitlist and we&apos;ll email you if another spot opens.
        </p>
      ) : (
        <p className={styles.waitlistCopy}>
          Seats are full for {NEXT_MOCK.testDateLabel}. Join the waitlist and we&apos;ll email you if a spot opens.
        </p>
      )}

      {closed ? (
        <p className={styles.waitlistClosed}>Signups for {NEXT_MOCK.testDateLabel} are closed.</p>
      ) : (
        <form className={styles.waitlistForm} onSubmit={submit}>
          <label htmlFor="waitlist-email" className={styles.waitlistLabel}>
            email
          </label>
          <input
            id="waitlist-email"
            type="email"
            required
            autoComplete="email"
            className={styles.waitlistInput}
            value={email}
            readOnly={Boolean(user)}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button type="submit" className={styles.waitlistButton} disabled={busy}>
            {busy ? "joining…" : "join the waitlist ✦"}
          </button>
          {error ? <p className={styles.waitlistError} role="alert">{error}</p> : null}
        </form>
      )}

      <p className={styles.waitlistFinePrint}>No payment needed to join the waitlist.</p>
    </section>
  );
}
