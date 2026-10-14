"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import NightSky from "@/components/NightSky";
import styles from "./signin.module.css";

function safeNext(value: string | null) { return value?.startsWith("/") && !value.startsWith("//") ? value : "/onboarding"; }

function SignInCard() {
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("callbackUrl"));
  const [error, setError] = useState("");
  const continueWithGoogle = () => {
    setError("");
    const callbackUrl = `/signin/complete?next=${encodeURIComponent(next)}`;
    void signIn("google", { callbackUrl });
  };
  return <main className={styles.page}><NightSky density="more" /><Link className={styles.logo} href="/">Aced<span>.</span></Link><section className={styles.card}><span className={styles.spark}>✦</span><h1>welcome to Aced</h1><p>Your ACT practice universe is waiting.</p><button type="button" className={styles.google} onClick={continueWithGoogle}><b>G</b>Continue with Google</button>{error && <p className={styles.error} role="alert">{error}</p>}</section><p className={styles.fine}>After Google sign-in, we’ll ask for the confirmations required to use Aced.</p></main>;
}

export default function SignInPage() { return <Suspense fallback={null}><SignInCard /></Suspense>; }
