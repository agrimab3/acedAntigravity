"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NEXT_MOCK } from "@/lib/mockTests";
import styles from "./MockTestCard.module.css";
import { useTourActive } from "@/components/useTourActive";

type PublicSeatStatus = {
  isFull?: boolean;
  text?: string;
};

export default function MockTestCard({
  dynamicSeats = false,
}: {
  dynamicSeats?: boolean;
}) {
  const [seatStatus, setSeatStatus] = useState<PublicSeatStatus>({
    isFull: false,
    text: "Limited seats",
  });

  useEffect(() => {
    if (!dynamicSeats) return;
    let cancelled = false;
    void fetch("/api/mock-test/seats", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: PublicSeatStatus | null) => {
        if (!cancelled && data) setSeatStatus(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [dynamicSeats]);

  const full = Boolean(seatStatus.isFull);
  const href = full ? "/mock-test/waitlist" : "/mock-test/signup";
  const [hidden, setHidden] = useState(false);
  const touring = useTourActive();
  useEffect(() => {
    const readDismissal = () => {
      try {
        setHidden(localStorage.getItem("aced:mock-test:hidden") === "hidden");
      } catch {}
    };
    const timer = window.setTimeout(readDismissal, 0);
    return () => window.clearTimeout(timer);
  }, []);
  if (hidden && !touring) return <button data-tour-target="mock-test-tile" className={styles.restore} type="button" onClick={() => { try { localStorage.removeItem("aced:mock-test:hidden"); } catch {} setHidden(false); }}>✦ Mock test</button>;

  return (
    <div data-tour-target="mock-test-tile" className={styles.shell}><section className={styles.card} aria-label="ACED Mock Test">
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.copy}>
        <div className={styles.eyebrow}>ACED Mock Test</div>
        <h2>{NEXT_MOCK.testDateShort.replace(",", "")}</h2>
        <div className={styles.meta}>
          <span className={styles.price}>$2</span>
          <span>·</span>
          <span>{seatStatus.text || "Limited seats"}</span>
        </div>
      </div>
      <Link href={href} prefetch={false} className={styles.cta}>
        {full ? "join waitlist" : "sign up"}
      </Link>
    </section><button className={styles.hide} type="button" aria-label="Hide" onClick={() => { try { localStorage.setItem("aced:mock-test:hidden", "hidden"); } catch {} setHidden(true); }}>×</button></div>
  );
}
