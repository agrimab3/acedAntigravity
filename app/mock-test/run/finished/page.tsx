import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { DM_Sans, Playfair_Display } from "next/font/google";
import NightSky from "@/components/NightSky";
import {
  mockTestAnswers,
  mockTestSectionRuns,
  mockTestSessions,
} from "@/db/schema";
import { getDb } from "@/lib/db";
import { getMockTestUser } from "@/lib/mockTest/auth";
import { getMockTestServerNow } from "@/lib/mockTest/devClock";
import {
  canBypassMockEventWindow,
  getPaidMockRegistration,
} from "@/lib/mockTest/runner";
import {
  MOCK_SECTIONS,
  NEXT_MOCK,
  TIME_ZONES,
  getMockTimeZoneDisplay,
} from "@/lib/mockTests";
import ScoreReleaseCountdown from "./ScoreReleaseCountdown";
import ScoreReleaseCalendar from "./ScoreReleaseCalendar";
import DevResetButton from "./DevResetButton";
import styles from "./finished.module.css";

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
  title: "Test submitted · ACED Mock Test",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function MockTestFinishedPage({
  searchParams,
}: {
  searchParams: Promise<{ previewZone?: string }>;
}) {
  const params = await searchParams;
  const user = await getMockTestUser();
  if (!user) redirect("/mock-test/signup");

  const registration = await getPaidMockRegistration(user.id);
  if (!registration) redirect("/mock-test/signup");
  if (!registration.finishedAt) redirect("/mock-test/run");

  const db = getDb();
  if (!db) redirect("/mock-test/run");

  const [session] = await db
    .select({
      id: mockTestSessions.id,
      status: mockTestSessions.status,
    })
    .from(mockTestSessions)
    .where(eq(mockTestSessions.registrationId, registration.id))
    .limit(1);

  if (!session || session.status !== "completed") {
    redirect("/mock-test/run");
  }

  const now = getMockTestServerNow();
  const releaseAt = new Date(NEXT_MOCK.resultsReleaseUtc);
  if (now.getTime() >= releaseAt.getTime()) {
    redirect("/mock-test/results");
  }

  const answers = await db
    .select({
      sectionKey: mockTestSectionRuns.sectionKey,
      selectedAnswer: mockTestAnswers.selectedAnswer,
    })
    .from(mockTestAnswers)
    .innerJoin(
      mockTestSectionRuns,
      and(
        eq(mockTestAnswers.sectionRunId, mockTestSectionRuns.id),
        eq(mockTestSectionRuns.sessionId, session.id)
      )
    )
    .where(eq(mockTestAnswers.sessionId, session.id));

  const answeredBySection = new Map<string, number>();
  for (const answer of answers) {
    if (!answer.selectedAnswer) continue;
    answeredBySection.set(
      answer.sectionKey,
      (answeredBySection.get(answer.sectionKey) ?? 0) + 1
    );
  }

  const previewZone =
    canBypassMockEventWindow() &&
    params.previewZone &&
    TIME_ZONES.some((item) => item.value === params.previewZone)
      ? params.previewZone
      : null;
  const displayTimeZone = previewZone ?? registration.timeZone;
  const zoneDisplay = getMockTimeZoneDisplay(displayTimeZone);
  const zone = TIME_ZONES.find((item) => item.value === displayTimeZone) ?? TIME_ZONES[0];
  const releaseDateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: displayTimeZone,
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(releaseAt);
  const localTimeOnly = new Intl.DateTimeFormat("en-US", {
    timeZone: displayTimeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(releaseAt);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  return (
    <div className={playfair.variable + " " + dmSans.variable}>
      <main className={styles.page}>
        <NightSky />
        <div className={styles.content}>
          <header className={styles.header}>
            <Link href="/dashboard" className={styles.logo} aria-label="Aced dashboard">
              Aced<span>.</span>
            </Link>
            <div className={styles.signedIn}>signed in as {user.email}</div>
          </header>

          <section className={styles.celebration}>
            <div className={styles.stars} aria-hidden="true">
              {MOCK_SECTIONS.map((section, index) => (
                <span
                  key={section.key}
                  className={styles["star" + (index + 1)]}
                  style={{ color: section.color }}
                >
                  ✦
                </span>
              ))}
            </div>
            <h1>
              you <em>did it!</em>
            </h1>
            <p>
              All four sections are submitted and your answers are locked in. Now the stars do the waiting.
            </p>
          </section>

          <section className={styles.releaseCard}>
            <div className={styles.releaseEyebrow}>YOUR SCORE ARRIVES</div>
            <h2>{releaseDateParts}</h2>
            <div className={styles.localReleaseTime}>at {localTimeOnly}</div>
            <div className={styles.zoneCopy}>
              your time ({zone.label}) · same moment for everyone
            </div>

            <ScoreReleaseCountdown
              releaseAt={NEXT_MOCK.resultsReleaseUtc}
              serverNow={now.toISOString()}
            />

            <div className={styles.releaseActions}>
              <ScoreReleaseCalendar
                releaseAt={NEXT_MOCK.resultsReleaseUtc}
                timeZone={displayTimeZone}
                localReleaseTime={zoneDisplay.localReleaseTime}
                siteUrl={siteUrl}
              />
              <Link href="/dashboard" className={styles.secondaryButton}>
                back to my universe
              </Link>
              {canBypassMockEventWindow() ? (
                <>
                  <Link
                    href="/mock-test/results?previewSeconds=30"
                    className={styles.devPreviewButton}
                  >
                    preview Results Day →
                  </Link>
                  <DevResetButton />
                </>
              ) : null}
            </div>
          </section>

          <section className={styles.submittedCard}>
            <div className={styles.cardLabel}>WHAT YOU SUBMITTED</div>
            <div className={styles.sectionGrid}>
              {MOCK_SECTIONS.map((section) => (
                <article key={section.key} className={styles.sectionCard}>
                  <div className={styles.sectionHeading}>
                    <span
                      className={styles.sectionDot}
                      style={{
                        background: section.color,
                        boxShadow: `0 0 12px ${section.color}`,
                      }}
                    />
                    <h3 style={{ color: section.color }}>{section.key}</h3>
                  </div>
                  <p>
                    {answeredBySection.get(section.key) ?? 0} of {section.questionCount} answered
                  </p>
                </article>
              ))}
            </div>
            <p className={styles.submittedFootnote}>
              No scores or right/wrong yet. Everything unlocks together on Sunday.
            </p>
          </section>

          <section className={styles.unlockSection}>
            <h2>
              what unlocks <em>Sunday</em>
            </h2>
            <div className={styles.unlockGrid}>
              <article className={styles.unlockCard}>
                <strong className={styles.teal}>1–36</strong>
                <h3>your estimated score</h3>
                <p>For each section, plus your composite from English, Math, and Reading.</p>
              </article>
              <article className={styles.unlockCard}>
                <strong className={styles.lavender}>rank</strong>
                <h3>where you stand</h3>
                <p>See how you did compared with everyone who took the {NEXT_MOCK.testDateShort.replace("Sat, ", "")} mock test.</p>
              </article>
              <article className={styles.unlockCard}>
                <strong className={styles.skyStars}>✦ ✦ ✦</strong>
                <h3>your sky lights up</h3>
                <p>Your star map brightens, and the dim stars show exactly what to practice before {NEXT_MOCK.actDateLabel}.</p>
              </article>
            </div>
            {/* TODO(mock-test-emails): update this line when result emails are available. */}
            <p className={styles.restLine}>
              Your results will be waiting on your Aced dashboard. Rest up tonight.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
