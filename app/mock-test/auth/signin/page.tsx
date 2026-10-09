"use client";

import { useEffect } from "react";
import { signIn } from "next-auth/react";
import { sanitizeInternalCallbackUrl } from "@/lib/safe-callback";

export default function MockTestSignInPage() {
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("returnTo");
    const returnTo = sanitizeInternalCallbackUrl(requested, "/mock-test/signup");
    void signIn("google", { callbackUrl: returnTo });
  }, []);

  return null;
}
