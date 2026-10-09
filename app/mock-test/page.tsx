import type { Metadata } from "next";
import Link from "next/link";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import { and, eq, isNotNull } from "drizzle-orm";
import NightSky from "@/components/NightSky";
import SeatCounter from "@/components/SeatCounter";
import { mockRegistrations, mockTests } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getMockTestUser } from "@/lib/mockTest/auth";
import { getSeatStatusCached } from "@/lib/mockTest/seats";
import MockStarMapPreview from "@/components/MockStarMapPreview";
import Countdown from "./Countdown";
import {
  MOCK_TEST,
  TOTAL_QUESTIONS,
  TOTAL_MINUTES,
  formatDuration,
} from "@/lib/mockTests";
import styles from "./mock-test.module.css";

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  variable: "--font-dm-serif",
  display: "swap",
  weight: "400",
  style: ["normal", "italic"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "The ACED Mock Test — Full ACT Practice Before Test Day",
  description:
    "Take a real-format, timed ACT from home on Saturday. On Sunday, everyone gets their estimated score at the same moment, plus a map of exactly what to fix before test day.",
};

export default async function MockTestPage() {
  const user = await getMockTestUser();
  const db = getDb();
  if (!db) throw new Error("Database is not configured.");

  const [mockTest] = await db
    .select({ id: mockTests.id, signupsPaused: mockTests.signupsPaused })
    .from(mockTests)
    .where(eq(mockTests.slug, MOCK_TEST.mockTestSlug))
    .limit(1);

  if (!mockTest) throw new Error("Mock test not found.");

  let paid = false;
  if (user?.id) {
    const [registration] = await db
      .select({ id: mockRegistrations.id })
      .from(mockRegistrations)
      .where(
        and(
          eq(mockRegistrations.mockTestId, mockTest.id),
          eq(mockRegistrations.userId, user.id),
          isNotNull(mockRegistrations.paidAt)
        )
      )
      .limit(1);
    paid = Boolean(registration);
  }

  const seatStatus = await getSeatStatusCached(mockTest.id);

  return (
    <div className={`${styles.pageRoot} ${dmSerif.variable} ${dmSans.variable}`}>
      {/* Animated starry sky background */}
      <NightSky />

      <div className={styles.contentWrapper}>
        {/* ==================================================================
            1. Header
            ================================================================== */}
        <header className={styles.header}>
          <Link href="/" className={styles.logo} aria-label="Aced home">
            Aced<span className={styles.tealDot}>.</span>
          </Link>

          <nav className={styles.nav} aria-label="Main Navigation">
            <Link href="#how" className={styles.navLink}>
              how it works
            </Link>
            <Link href="#faq" className={styles.navLink}>
              new here?
            </Link>
            <Link href="/" className={styles.signInPill}>
              sign in
            </Link>
          </nav>
        </header>

        {/* ==================================================================
            2. Hero (centered)
            ================================================================== */}
        <section className={styles.heroSection}>
          <div className={styles.heroBadge}>
            <span className={styles.twinkleDot} />
            <span>
              {!paid && mockTest.signupsPaused
                ? "signups are paused · check back soon"
                : !paid && seatStatus.isFull
                  ? "seats are full · join the waitlist"
                  : `new · the ACED Mock Test · ${MOCK_TEST.testDateLabel}`}
            </span>
          </div>

          <h1 className={styles.heroHeading}>
            a full practice ACT,
            <br />
            <em className={styles.heroTealText}>one week before the real one</em>
          </h1>

          <p className={styles.heroParagraph}>
            Take a real-format, timed ACT from home on Saturday. On Sunday,
            everyone gets their estimated score at the same moment, plus a map of
            exactly what to fix before test day.
          </p>

          {/* Gist Bar */}
          <dl className={styles.gistBar}>
            <div className={styles.gistCell}>
              <dt className={styles.gistLabel}>WHEN</dt>
              <dd className={styles.gistValue}>{MOCK_TEST.testDateShort}</dd>
              <span className={styles.gistSub}>any time that day, your time</span>
            </div>

            <div className={styles.gistCell}>
              <dt className={styles.gistLabel}>WHAT</dt>
              <dd className={styles.gistValue}>all 4 sections</dd>
              <span className={styles.gistSub}>
                {TOTAL_QUESTIONS} questions · {formatDuration(TOTAL_MINUTES)}, timed
              </span>
            </div>

            <div className={`${styles.gistCell} ${styles.gistCellTeal}`}>
              <dt className={styles.gistLabel}>RESULTS</dt>
              <dd className={styles.gistValue}>{MOCK_TEST.resultsLabel}</dd>
              <span className={styles.gistSub}>score, rank + your star map</span>
            </div>

            <div className={styles.gistCell}>
              <dt className={styles.gistLabel}>COST</dt>
              <dd className={styles.gistValue}>${MOCK_TEST.priceUsd}</dd>
              <span className={styles.gistSub}>one time · Google sign-in at signup</span>
            </div>
          </dl>

          {/* Hero CTAs */}
          <div className={styles.heroButtonGroup}>
            {paid || !mockTest.signupsPaused ? (
              <Link
                href={paid ? "/mock-test/confirmed" : "/mock-test/signup"}
                className={styles.ctaButtonTeal}
              >
                {paid
                  ? "view my ticket ✦"
                  : seatStatus.isFull
                    ? "join the waitlist ✦"
                    : "take the mock test"}
                {!paid && !seatStatus.isFull ? (
                  <span className={styles.pricePill}>${MOCK_TEST.priceUsd}</span>
                ) : null}
              </Link>
            ) : (
              <div className={styles.ctaButtonTeal} aria-disabled="true">
                signups are paused, check back soon
              </div>
            )}

            <Link href="#how" className={styles.ctaButtonOutline}>
              see how it works ↓
            </Link>
          </div>

          {!paid ? (
            <div className={styles.heroSeatCounter}>
              <SeatCounter
                limit={seatStatus.limit}
                remaining={seatStatus.remaining}
                isFull={seatStatus.isFull}
              />
            </div>
          ) : null}
        </section>

        {/* ==================================================================
            3. Star Map Preview
            ================================================================== */}
        <section className={styles.starmapSection} aria-label="Constellation Star Map Preview">
          <div className={styles.starmapWrapper}>
            <MockStarMapPreview />
            <div className={styles.starmapBadge}>
              ✦ this is what Sunday looks like
            </div>
          </div>
        </section>

        {/* ==================================================================
            4. How it works (id="how")
            ================================================================== */}
        <section id="how" className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionEyebrow}>HOW IT WORKS</span>
            <h2 className={styles.sectionHeading}>
              one week that <em>changes your score</em>
            </h2>
          </div>

          <div className={styles.howGrid}>
            <article className={styles.howCard}>
              <div className={styles.howCardDate}>SATURDAY · DEC 5</div>
              <h3 className={styles.howCardTitle}>you take it</h3>
              <p className={styles.howCardBody}>
                The full test, timed like the real thing. Start any time before{" "}
                {MOCK_TEST.startCutoffLabel}, your time.
              </p>
            </article>

            <article className={`${styles.howCard} ${styles.howCardTeal}`}>
              <div className={styles.howCardDate}>
                {MOCK_TEST.resultsLongLabel.toUpperCase()}
              </div>
              <h3 className={styles.howCardTitle}>
                your sky <em>lights up</em>
              </h3>
              <p className={styles.howCardBody}>
                Everyone&apos;s scores drop at once. See your estimated score, where
                you rank, and which stars are still dim.
              </p>
            </article>

            <article className={styles.howCard}>
              <div className={styles.howCardDate}>SATURDAY · DEC 12</div>
              <h3 className={styles.howCardTitle}>you walk in ready</h3>
              <p className={styles.howCardBody}>
                A full week to practice your weakest topics before the real ACT.
              </p>
            </article>
          </div>
        </section>

        {/* ==================================================================
            5. Sections (4 columns)
            ================================================================== */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionHeading}>
              the whole test. <em className={styles.mutedItalic}>nothing skipped.</em>
            </h2>
          </div>

          <div className={styles.sectionsGrid}>
            {MOCK_TEST.sections.map((section) => (
              <article key={section.key} className={styles.sectionCard}>
                <span className={styles.constellationName}>
                  {section.constellation}
                </span>
                <h3
                  className={styles.sectionTitle}
                  style={{
                    color: section.color,
                    textShadow: `0 0 20px ${section.color}40`,
                  }}
                >
                  {section.title}
                </h3>
                <div className={styles.sectionTiming}>
                  {section.questionCount} questions · {section.durationMinutes} min
                </div>
                {section.description && (
                  <p className={styles.sectionDesc}>{section.description}</p>
                )}
              </article>
            ))}
          </div>
        </section>

        {/* ==================================================================
            6. FAQ (id="faq")
            ================================================================== */}
        <section id="faq" className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionHeading}>
              new <em>here?</em>
            </h2>
          </div>

          <div className={styles.faqGrid}>
            <article className={styles.faqCard}>
              <h3 className={styles.faqQuestion}>What is Aced?</h3>
              <p className={styles.faqAnswer}>
                An ACT prep app where every topic is a star. Practice a topic and
                its star gets brighter, until your whole sky is lit.
              </p>
            </article>

            <article className={styles.faqCard}>
              <h3 className={styles.faqQuestion}>Do I need an Aced account?</h3>
              <p className={styles.faqAnswer}>
                No. Just sign in with Google when you sign up. Your results and star
                map are saved there.
              </p>
            </article>

            <article className={styles.faqCard}>
              <h3 className={styles.faqQuestion}>Is this the real ACT?</h3>
              <p className={styles.faqAnswer}>
                It&apos;s a practice test in the real format and timing. Your score
                is an estimate, not an official ACT score.
              </p>
            </article>

            <article className={styles.faqCard}>
              <h3 className={styles.faqQuestion}>What if my wifi drops?</h3>
              <p className={styles.faqAnswer}>
                Log back in and keep going. The timer keeps running, so get back
                fast. (The real ACT won&apos;t be this forgiving.)
              </p>
            </article>
          </div>
        </section>

        {/* ==================================================================
            7. Final CTA Card
            ================================================================== */}
        <section className={styles.finalCtaSection}>
          <div className={styles.finalCtaCard}>
            <div className={styles.ctaCardGlow} />
            <span className={styles.ctaCardEyebrow}>TEST OPENS IN</span>

            <Countdown testDate={MOCK_TEST.testDate} />

            <h2 className={styles.finalCtaHeading}>
              your ACT is {MOCK_TEST.actDateLabel}?
              <br />
              <em>take this one first.</em>
            </h2>

            {!paid ? (
              <div className={styles.finalSeatCounter}>
                <SeatCounter
                  limit={seatStatus.limit}
                  remaining={seatStatus.remaining}
                  isFull={seatStatus.isFull}
                />
              </div>
            ) : null}

            {paid || !mockTest.signupsPaused ? (
              <Link
                href={paid ? "/mock-test/confirmed" : "/mock-test/signup"}
                className={styles.ctaButtonTeal}
              >
                {paid
                  ? "view my ticket ✦"
                  : seatStatus.isFull
                    ? "join the waitlist ✦"
                    : "save my seat"}
                {!paid && !seatStatus.isFull ? (
                  <span className={styles.pricePill}>${MOCK_TEST.priceUsd}</span>
                ) : null}
              </Link>
            ) : (
              <div className={styles.ctaButtonTeal} aria-disabled="true">
                signups are paused, check back soon
              </div>
            )}

            <p className={styles.ctaDisclaimer}>
              non-refundable · estimated scores, not official ACT scores
            </p>
          </div>
        </section>

      </div>
    </div>
  );
}
