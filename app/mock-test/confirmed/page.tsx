import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { DM_Sans, Playfair_Display } from "next/font/google";
import NightSky from "@/components/NightSky";
import { mockRegistrations, mockTests } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getMockTestUser } from "@/lib/mockTest/auth";
import {
  MOCK_SECTIONS,
  NEXT_MOCK,
  TOTAL_MINUTES,
  TOTAL_QUESTIONS,
  formatDuration,
  getMockTimeZoneDisplay,
} from "@/lib/mockTests";
import AddToCalendar from "./AddToCalendar";
import WaitingForPayment from "./WaitingForPayment";
import DevResetSignupButton from "./DevResetSignupButton";
import { canBypassMockEventWindow } from "@/lib/mockTest/runner";
import styles from "./confirmed.module.css";

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
  title: "You're in · ACED Mock Test",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function MockTestConfirmedPage() {
  const user = await getMockTestUser();
  if (!user) {
    redirect("/mock-test/signup");
  }

  const db = getDb();
  if (!db) {
    redirect("/mock-test/signup");
  }

  const [registration] = await db
    .select({
      id: mockRegistrations.id,
      timeZone: mockRegistrations.timeZone,
      paidAt: mockRegistrations.paidAt,
    })
    .from(mockRegistrations)
    .innerJoin(mockTests, eq(mockRegistrations.mockTestId, mockTests.id))
    .where(
      and(
        eq(mockTests.slug, NEXT_MOCK.mockTestSlug),
        eq(mockRegistrations.userId, user.id)
      )
    )
    .limit(1);

  if (!registration) {
    redirect("/mock-test/signup");
  }

  if (!registration.paidAt) {
    return (
      <div className={`${styles.pageRoot} ${playfair.variable} ${dmSans.variable}`}>
        <NightSky />
        <WaitingForPayment />
      </div>
    );
  }

  const zoneDisplay = getMockTimeZoneDisplay(registration.timeZone);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  return (
    <div className={`${styles.pageRoot} ${playfair.variable} ${dmSans.variable}`}>
      <NightSky />

      <div className={styles.content}>
        <header className={styles.header}>
          <Link href="/" className={styles.logo} aria-label="Aced home">
            Aced<span className={styles.tealDot}>.</span>
          </Link>
          <p className={styles.signedIn}>signed in as {user.email}</p>
        </header>

        <main>
          <section className={styles.celebration}>
            <div className={styles.sparkles} aria-hidden="true">
              {["#5DCAA5", "#AFA9EC", "#EF9F27", "#F0997B"].map((color, index) => (
                <span
                  key={color}
                  style={{
                    color,
                    textShadow: `0 0 18px ${color}`,
                    animationDelay: `${index % 3}s`,
                  }}
                >
                  ✦
                </span>
              ))}
            </div>

            <h1 className={styles.heading}>
              you&apos;re <em>in.</em>
            </h1>

            {/* TODO(mock-test-emails): change this line when ticket emails are available. */}
            <p className={styles.celebrationCopy}>
              See you {NEXT_MOCK.testDateLabel}. Your ticket is saved to your Aced account.
            </p>
          </section>

          <section className={styles.ticketWrap} aria-label="Your ACED Mock Test ticket">
            <div className={styles.ticket}>
              <div className={styles.ticketLeft}>
                <div className={styles.ticketEyebrow}>YOUR TICKET · ACED MOCK TEST</div>

                <div>
                  <h2 className={styles.ticketDate}>{NEXT_MOCK.testDateLabel}</h2>
                  <p className={styles.ticketSummary}>
                    full ACT · {TOTAL_QUESTIONS} questions · {formatDuration(TOTAL_MINUTES)}
                  </p>
                </div>

                <div className={styles.sectionStrip}>
                  <div className={styles.dots} aria-hidden="true">
                    {MOCK_SECTIONS.map((section) => (
                      <span
                        key={section.key}
                        className={styles.sectionDot}
                        style={{
                          background: section.color,
                          boxShadow: `0 0 14px ${section.color}`,
                        }}
                      />
                    ))}
                  </div>
                  <div className={styles.sectionNames}>
                    {MOCK_SECTIONS.map((section) => section.key).join(" · ")}
                  </div>
                </div>
              </div>

              <dl className={styles.ticketRight}>
                <div>
                  <dt>OPENS</dt>
                  <dd>12:00 AM {zoneDisplay.shortLabel}</dd>
                </div>
                <div>
                  <dt>START BY</dt>
                  <dd>{NEXT_MOCK.startCutoffLabel.replace(" PM", ":00 PM").replace(" AM", ":00 AM")} {zoneDisplay.shortLabel}</dd>
                </div>
                <div className={styles.scoreItem}>
                  <dt>SCORES OUT</dt>
                  <dd>Sun, {zoneDisplay.localReleaseTime}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className={styles.actions} aria-label="Ticket actions">
            <AddToCalendar
              timeZone={registration.timeZone}
              shortZone={zoneDisplay.shortLabel}
              localReleaseTime={zoneDisplay.localReleaseTime}
              siteUrl={siteUrl}
            />
            <Link href="/dashboard" className={styles.exploreButton}>
              explore Aced while you wait
            </Link>
            {canBypassMockEventWindow() ? <DevResetSignupButton /> : null}
          </section>

          <section className={styles.tips}>
            <h2 className={styles.tipsHeading}>
              before <em>{NEXT_MOCK.testDateLabel.split(", ")[0]}</em>
            </h2>

            <div className={styles.tipsGrid}>
              <article className={styles.tipCard}>
                <strong style={{ color: MOCK_SECTIONS[0].color }}>3 hrs</strong>
                <h3>block off the time</h3>
                <p>The timer keeps running once you start, so pick a stretch where nobody needs you.</p>
              </article>

              <article className={styles.tipCard}>
                <strong style={{ color: MOCK_SECTIONS[1].color }}>quiet</strong>
                <h3>find a calm spot</h3>
                <p>Treat it like test day: phone away, good wifi, a desk instead of your bed.</p>
              </article>

              <article className={styles.tipCard}>
                <strong style={{ color: MOCK_SECTIONS[2].color }}>{NEXT_MOCK.startCutoffLabel}</strong>
                <h3>start before the cutoff</h3>
                <p>
                  After {NEXT_MOCK.startCutoffLabel} your time, the test won&apos;t let you start, so don&apos;t leave it too late.
                </p>
              </article>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
