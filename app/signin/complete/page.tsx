"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

function safeNext(value: string | null) { return value?.startsWith("/") && !value.startsWith("//") ? value : "/onboarding"; }
function CompleteSignIn() {
  const router = useRouter(); const params = useSearchParams();
  useEffect(() => { const finish = async () => { try { const response = await fetch("/api/account/consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agreedTerms: true, emailOptIn: params.get("emailOptIn") === "1" }) }); if (!response.ok) throw new Error("Could not save consent."); try { localStorage.setItem("aced-signin-consent", "complete"); } catch {} router.replace(safeNext(params.get("next"))); } catch { router.replace(`/signin?callbackUrl=${encodeURIComponent(safeNext(params.get("next")))}`); } }; void finish(); }, [params, router]);
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>Saving your preferences…</main>;
}
export default function CompleteSignInPage() { return <Suspense fallback={null}><CompleteSignIn /></Suspense>; }
