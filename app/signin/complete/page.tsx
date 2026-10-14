"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import styles from "../signin.module.css";

function safeNext(value: string | null) { return value?.startsWith("/") && !value.startsWith("//") ? value : "/onboarding"; }
function CompleteSignIn() {
  const router = useRouter(); const params = useSearchParams();
  const [consent,setConsent]=useState<{complete:boolean;termsVersion:string}|null>(null); const [age,setAge]=useState(false); const [terms,setTerms]=useState(false); const [emailOptIn,setEmailOptIn]=useState(false); const [error,setError]=useState(""); const [saving,setSaving]=useState(false);
  useEffect(()=>{void fetch("/api/account/consent",{cache:"no-store"}).then(async response=>{if(!response.ok)throw Error();return response.json() as Promise<{complete:boolean;termsVersion:string}>;}).then(data=>{if(data.complete)router.replace(safeNext(params.get("next")));else setConsent(data);}).catch(()=>setError("We couldn’t confirm your account. Please sign in again."));},[params,router]);
  const submit=async()=>{if(!age||!terms||!consent){setError("Please complete both required confirmations.");return;}setSaving(true);setError("");try{const response=await fetch("/api/account/consent",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ageConfirmed:true,agreedTerms:true,termsVersion:consent.termsVersion,emailOptIn})});if(!response.ok)throw Error();router.replace(safeNext(params.get("next")));}catch{setError("We couldn’t save your confirmations. Please try again.");setSaving(false);}};
  if(!consent)return <main className={styles.page}><section className={styles.card}><p>{error||"Checking your account…"}</p></section></main>;
  return <main className={styles.page}><section className={styles.card}><span className={styles.spark}>✦</span><h1>one quick step</h1><p>Before you use Aced, please confirm the following.</p><div className={styles.checks}><label><input type="checkbox" checked={age} onChange={event=>setAge(event.target.checked)}/><span>I confirm that I am at least 13 years old. <b aria-label="required">*</b></span></label><label><input type="checkbox" checked={terms} onChange={event=>setTerms(event.target.checked)}/><span>I agree to Aced&apos;s <Link href="/legal?tab=terms">Terms</Link> and <Link href="/legal?tab=privacy">Privacy Policy</Link>. <b aria-label="required">*</b></span></label><label><input type="checkbox" checked={emailOptIn} onChange={event=>setEmailOptIn(event.target.checked)}/><span>Email me Aced updates and mock test dates.</span></label></div><button type="button" className={styles.google} disabled={saving} onClick={()=>void submit()}>{saving?"Saving…":"Continue"}</button>{error&&<p className={styles.error} role="alert">{error}</p>}</section></main>;
}
export default function CompleteSignInPage() { return <Suspense fallback={null}><CompleteSignIn /></Suspense>; }
