"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { OnboardingApiResponse } from "@/lib/onboarding";

type UseOnboardingStateOptions = {
  redirectIfIncomplete?: string;
  redirectIfCompleteTo?: string;
};

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export function useOnboardingState(
  status: AuthStatus,
  options: UseOnboardingStateOptions = {}
) {
  const router = useRouter();
  const [data, setData] = useState<OnboardingApiResponse | null>(null);
  const [loading, setLoading] = useState(status === "authenticated");
  const redirectIfIncomplete = options.redirectIfIncomplete;
  const redirectIfCompleteTo = options.redirectIfCompleteTo;

  useEffect(() => {
    let active = true;
    let abortController: AbortController | null = null;

    if (status === "loading") {
      setLoading(true);
      return () => {
        active = false;
      };
    }

    if (status !== "authenticated") {
      setLoading(false);
      setData(null);
      return () => {
        active = false;
      };
    }

    const load = async () => {
      setLoading(true);
      abortController = new AbortController();
      const signal = abortController.signal;

      const timeoutId = setTimeout(() => {
        abortController?.abort();
      }, 5000);

      try {
        const res = await fetch("/api/onboarding", {
          cache: "no-store",
          signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          if (res.status === 401 && redirectIfIncomplete) {
            router.replace("/");
          }
          return;
        }

        const nextData = (await res.json()) as OnboardingApiResponse;

        if (!active) {
          return;
        }

        setData(nextData);

        if (!nextData.isComplete && redirectIfIncomplete) {
          router.replace(redirectIfIncomplete);
          return;
        }

        if (nextData.isComplete && redirectIfCompleteTo) {
          router.replace(redirectIfCompleteTo);
          return;
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          console.warn("Onboarding state fetch timed out after 5s.");
        } else {
          console.error("Failed to load onboarding state", error);
        }
      } finally {
        clearTimeout(timeoutId);
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
      abortController?.abort();
    };
  }, [redirectIfCompleteTo, redirectIfIncomplete, router, status]);

  return { data, loading };
}
