import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { DM_Sans, Playfair_Display } from "next/font/google";
import NightSky from "@/components/NightSky";
import TestModeBanner from "@/components/TestModeBanner";
import { mockRegistrations, mockTests } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getMockTestUser } from "@/lib/mockTest/auth";
import { getMockTestPaymentMode, logUnsafeProductionMockTestMode } from "@/lib/mockTest/mode";
import { NEXT_MOCK } from "@/lib/mockTests";
import CompleteTestPayment from "./CompleteTestPayment";
import styles from "../dev.module.css";

const devSerif = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-dev-serif",
  display: "swap",
  weight: ["600", "700"],
  style: ["normal", "italic"],
});

const devSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dev-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

type CheckoutPageProps = {
  searchParams: Promise<{ registrationId?: string }>;
};

export default async function MockTestDevCheckoutPage({ searchParams }: CheckoutPageProps) {
  if (process.env.NODE_ENV === "production" || getMockTestPaymentMode() !== "test") {
    logUnsafeProductionMockTestMode();
    notFound();
  }

  const user = await getMockTestUser();
  if (!user) redirect("/mock-test/signup");

  const params = await searchParams;
  if (!params.registrationId) redirect("/mock-test/signup");

  const db = getDb();
  if (!db) redirect("/mock-test/signup");

  const [registration] = await db
    .select({
      id: mockRegistrations.id,
      paidAt: mockRegistrations.paidAt,
      timeZone: mockRegistrations.timeZone,
    })
    .from(mockRegistrations)
    .innerJoin(mockTests, eq(mockRegistrations.mockTestId, mockTests.id))
    .where(
      and(
        eq(mockRegistrations.id, params.registrationId),
        eq(mockRegistrations.userId, user.id),
        eq(mockTests.slug, NEXT_MOCK.mockTestSlug)
      )
    )
    .limit(1);

  if (!registration) redirect("/mock-test/signup");
  if (registration.paidAt) redirect("/mock-test/confirmed");

  return (
    <div className={`${styles.pageRoot} ${devSerif.variable} ${devSans.variable}`}>
      <NightSky />
      <TestModeBanner />

      <main className={styles.content}>
        <section className={styles.card}>
          <div className={styles.eyebrow}>TEST PAYMENT · NO REAL CHARGE</div>
          <h1 className={styles.heading}>
            finish your <em>test checkout</em>
          </h1>
          <p className={styles.copy}>
            This simulates the Stripe step. Clicking below marks this registration paid and sends you to your ticket.
          </p>

          <div className={styles.checkoutSummary}>
            <div><span>student</span><strong>{user.email}</strong></div>
            <div><span>mock test</span><strong>{NEXT_MOCK.testDateLabel}</strong></div>
            <div><span>test amount</span><strong>${NEXT_MOCK.priceUsd}</strong></div>
          </div>

          <CompleteTestPayment registrationId={registration.id} />
        </section>
      </main>
    </div>
  );
}
