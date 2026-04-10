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

  useEffect(() => {
    if (status === "loading") {
      setLoading(true);
      return;
    }

    if (status !== "authenticated") {
      setLoading(false);
      setData(null);
      return;
    }

    let active = true;

    const load = async () => {
      setLoading(true);

      try {
        const res = await fetch("/api/onboarding", { cache: "no-store" });
        if (!res.ok) {
          return;
        }

        const nextData = (await res.json()) as OnboardingApiResponse;

        if (!active) {
          return;
        }

        setData(nextData);

        if (!nextData.isComplete && options.redirectIfIncomplete) {
          router.replace(options.redirectIfIncomplete);
          return;
        }

        if (nextData.isComplete && options.redirectIfCompleteTo) {
          router.replace(options.redirectIfCompleteTo);
          return;
        }
      } catch (error) {
        console.error("Failed to load onboarding state", error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [options.redirectIfCompleteTo, options.redirectIfIncomplete, router, status]);

  return { data, loading };
}
