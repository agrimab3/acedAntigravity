"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, useSyncExternalStore } from "react";
import NightSky from "@/components/NightSky";
import styles from "./signin.module.css";

function safeNext(value: string | null) { return value?.startsWith("/") && !value.startsWith("//") ? value : "/onboarding"; }

function SignInCard() {
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("callbackUrl"));
  const knownVisitor = useSyncExternalStore(() => () => {}, () => { try { return localStorage.getItem("aced-signin-consent") === "complete"; } catch { return false; } }, () => false);
  const [agreed, setAgreed] = useState(false);
  const [emailOptIn, setEmailOptIn] = useState(false);
  const [error, setError] = useState("");
  const continueWithGoogle = () => {
    if (!knownVisitor && !agreed) { setError("Please agree to the Terms and Privacy Policy first."); return; }
    const callbackUrl = knownVisitor ? next : `/signin/complete?next=${encodeURIComponent(next)}&emailOptIn=${emailOptIn ? "1" : "0"}`;
    void signIn("google", { callbackUrl });
  };
  return <main className={styles.page}><NightSky density="more" /><Link className={styles.logo} href="/">Aced<span>.</span></Link><section className={styles.card}><span className={styles.spark}>✦</span><h1>{knownVisitor ? "welcome back" : "welcome to Aced"}</h1><p>{knownVisitor ? "Pick up where you left off in your constellation." : "Your ACT practice universe is waiting."}</p>{!knownVisitor && <div className={styles.checks}><label><input type="checkbox" required aria-required="true" checked={agreed} onChange={event => { setAgreed(event.target.checked); setError(""); }} /><span>I agree to Aced&apos;s <Link href="/legal?tab=terms">Terms</Link> and <Link href="/legal?tab=privacy">Privacy Policy</Link>. <b aria-label="required">*</b></span></label><label><input type="checkbox" checked={emailOptIn} onChange={event => setEmailOptIn(event.target.checked)} /><span>Email me Aced updates and mock test dates.</span></label></div>}<button type="button" className={styles.google} onClick={continueWithGoogle}><b>G</b>Continue with Google</button>{error && <p className={styles.error} role="alert">{error}</p>}</section><p className={styles.fine}>By continuing, you&apos;ll be able to save your progress and return to your star map anytime.</p></main>;
}

export default function SignInPage() { return <Suspense fallback={null}><SignInCard /></Suspense>; }
