import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, isNotNull } from "drizzle-orm";
import { mockRegistrations, mockTests } from "@/db/schema";
import { getDb } from "@/lib/db";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import NightSky from "@/components/NightSky";
import { NEXT_MOCK } from "@/lib/mockTests";
import TestModeBanner from "@/components/TestModeBanner";
import { getMockTestUser, signInUrl, signOutUrl } from "@/lib/mockTest/auth";
import { getMockTestAuthMode, getMockTestPaymentMode } from "@/lib/mockTest/mode";
import { getSeatStatusCached } from "@/lib/mockTest/seats";
import { findWaitlistEntry, getInviteByToken, normalizeWaitlistEmail } from "@/lib/mockTest/waitlist";
import SignupForm from "./SignupForm";
import WaitlistCard from "./WaitlistCard";
import styles from "./signup.module.css";

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

type SignupPageProps = {
  searchParams: Promise<{ canceled?: string; waitlist?: string; invite?: string }>;
};

export default async function MockTestSignupPage({ searchParams }: SignupPageProps) {
  const userSession = await getMockTestUser();
  const params = await searchParams;
  const authMode = getMockTestAuthMode();
  const paymentMode = getMockTestPaymentMode();
  const isTestMode = authMode === "test" || paymentMode === "test";

  const db = getDb();
  if (!db) throw new Error("Database is not configured.");

  const [mockTest] = await db
    .select({ id: mockTests.id, signupsPaused: mockTests.signupsPaused })
    .from(mockTests)
    .where(eq(mockTests.slug, NEXT_MOCK.mockTestSlug))
    .limit(1);

  if (!mockTest) throw new Error("Mock test not found.");

  if (userSession?.id) {
    const [paidRegistration] = await db
      .select({ id: mockRegistrations.id })
      .from(mockRegistrations)
      .where(
        and(
          eq(mockRegistrations.mockTestId, mockTest.id),
          eq(mockRegistrations.userId, userSession.id),
          isNotNull(mockRegistrations.paidAt)
        )
      )
      .limit(1);

    if (paidRegistration) redirect("/mock-test/confirmed");
  }

  const seatStatus = await getSeatStatusCached(mockTest.id);
  const invite = await getInviteByToken(params.invite);
  const inviteForThisTest = invite?.mockTestId === mockTest.id ? invite : null;
  const validInvite = Boolean(
    userSession &&
      inviteForThisTest &&
      normalizeWaitlistEmail(userSession.email) === normalizeWaitlistEmail(inviteForThisTest.email)
  );
  const signedOutInvitePending = Boolean(!userSession && inviteForThisTest);
  const showWaitlist =
    !mockTest.signupsPaused &&
    (seatStatus.isFull || params.waitlist === "1") && !validInvite && !signedOutInvitePending;

  const existingWaitlist =
    showWaitlist && userSession
      ? await findWaitlistEntry(mockTest.id, userSession.email)
      : null;

  const user = userSession
    ? {
        email: userSession.email,
        name: userSession.name,
        initial: (userSession.name?.trim()[0] ?? userSession.email[0] ?? "A").toUpperCase(),
      }
    : null;

  const returnTo = params.invite
    ? `/mock-test/signup?invite=${encodeURIComponent(params.invite)}`
    : "/mock-test/signup";

  return (
    <div className={`${styles.pageRoot} ${dmSerif.variable} ${dmSans.variable}`}>
      <NightSky />
      {isTestMode ? <TestModeBanner /> : null}

      <div className={styles.content}>
        <header className={styles.header}>
          <Link href="/" className={styles.logo} aria-label="Aced home">
            Aced<span className={styles.tealDot}>.</span>
          </Link>
          <Link href="/mock-test" className={styles.backLink}>
            ← back to the mock test
          </Link>
        </header>

        <main>
          {mockTest.signupsPaused ? (
            <section className={styles.hero}>
              <div className={styles.badge}>
                <span className={styles.badgeDot} aria-hidden="true" />
                <span>ACED Mock Test · {NEXT_MOCK.testDateLabel}</span>
              </div>
              <h1 className={styles.heading}>signups are <em>paused</em></h1>
              <p className={styles.heroCopy}>signups are paused, check back soon.</p>
            </section>
          ) : showWaitlist ? (
            <div className={styles.waitlistArea}>
              <div className={styles.badge}>
                <span className={styles.badgeDot} aria-hidden="true" />
                <span>ACED Mock Test · {NEXT_MOCK.testDateLabel}</span>
              </div>
              <WaitlistCard
                limit={seatStatus.limit}
                user={user ? { email: user.email } : null}
                initialJoinedEmail={existingWaitlist?.email ?? null}
              />
            </div>
          ) : (
            <>
              <section className={styles.hero}>
                <div className={styles.badge}>
                  <span className={styles.badgeDot} aria-hidden="true" />
                  <span>ACED Mock Test · {NEXT_MOCK.testDateLabel}</span>
                </div>

                <h1 className={styles.heading}>
                  save your <em>seat</em>
                </h1>

                <p className={styles.heroCopy}>
                  Two quick things and you&apos;re in. Your ticket on the right updates as you go.
                </p>
              </section>

              <SignupForm
                user={user}
                canceled={params.canceled === "1"}
                authMode={authMode}
                paymentMode={paymentMode}
                signInHref={signInUrl(returnTo)}
                signOutHref={signOutUrl(returnTo)}
                seatStatus={seatStatus}
                inviteToken={validInvite ? params.invite : undefined}
                invited={validInvite}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
