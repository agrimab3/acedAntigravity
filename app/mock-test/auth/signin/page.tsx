"use client";

import { useEffect } from "react";
import { signIn } from "next-auth/react";
import { sanitizeInternalCallbackUrl } from "@/lib/safe-callback";

export default function MockTestSignInPage() {
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("returnTo");
    const returnTo = sanitizeInternalCallbackUrl(requested, "/mock-test/signup");
    // New accounts must finish the server-enforced age and Terms confirmations
    // before signup treats their session as eligible.
    const callbackUrl = `/signin/complete?next=${encodeURIComponent(returnTo)}`;
    void signIn("google", { callbackUrl });
  }, []);

  return null;
}
