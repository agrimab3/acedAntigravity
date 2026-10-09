import type { Metadata } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import { redirect } from "next/navigation";
import { getMockTestUser } from "@/lib/mockTest/auth";
import { getMockTestServerNow } from "@/lib/mockTest/devClock";
import { NEXT_MOCK } from "@/lib/mockTests";
import {
  canBypassMockEventWindow,
  getPaidMockRegistration,
} from "@/lib/mockTest/runner";
import ResultsClient from "./results-client";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
  weight: ["700"],
  style: ["normal", "italic"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Mock Test Results · Aced",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function MockTestResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ previewSeconds?: string; previewReleased?: string }>;
}) {
  const params = await searchParams;
  const serverNow = getMockTestServerNow().toISOString();
  const user = await getMockTestUser();
  if (!user) redirect("/mock-test/signup");

  const registration = await getPaidMockRegistration(user.id);
  if (!registration) redirect("/mock-test/signup");

  const allowDevControls = canBypassMockEventWindow();
  const parsedPreview = Number(params.previewSeconds);
  const previewSeconds =
    allowDevControls &&
    Number.isFinite(parsedPreview) &&
    parsedPreview >= 0
      ? Math.floor(parsedPreview)
      : null;

  const localReleaseTime = new Intl.DateTimeFormat("en-US", {
    timeZone: registration.timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(NEXT_MOCK.resultsReleaseUtc));

  return (
    <div className={playfair.variable + " " + dmSans.variable}>
      <ResultsClient
        email={user.email}
        previewSeconds={previewSeconds}
        previewReleased={allowDevControls && params.previewReleased === "1"}
        allowDevControls={allowDevControls}
        serverNow={serverNow}
        localReleaseTime={localReleaseTime}
      />
    </div>
  );
}
