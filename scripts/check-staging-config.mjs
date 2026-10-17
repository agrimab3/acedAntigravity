#!/usr/bin/env node
// Read-only staging gate. It prints only check names, never configuration values.
import { URL } from "node:url";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const stagingOrigin = "https://staging.aceditprep.com";
export const singleEmail = (value = "") => /^[^\s,@]+@[^\s,@]+\.[^\s,@]+$/.test(value);
export const matchingStagingOwnerEmail = (testRecipient, fixtureOwner) =>
  singleEmail(testRecipient) && singleEmail(fixtureOwner) && testRecipient === fixtureOwner;
const stagingDatabase = (value = "") => {
  try {
    const url = new URL(value);
    return url.pathname === "/aced_staging" && url.username === "aced_staging";
  } catch {
    return false;
  }
};
export const stagingChecks = (config) => [
  ["staging deployment marker", config.ACED_DEPLOYMENT_ENV === "staging"],
  ["canonical staging auth URL", config.NEXTAUTH_URL === stagingOrigin],
  ["canonical staging public URL", config.NEXT_PUBLIC_SITE_URL === stagingOrigin],
  ["isolated staging database name and user", stagingDatabase(config.DATABASE_URL)],
  ["Google provider", Boolean(config.AUTH_GOOGLE_ID && config.AUTH_GOOGLE_SECRET)],
  ["Stripe TEST secret", config.STRIPE_SECRET_KEY?.startsWith("sk_test_")],
  ["Stripe TEST public key", config.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_")],
  ["staging Stripe webhook secret", config.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")],
  ["Resend", Boolean(config.RESEND_API_KEY)],
  ["single owner email recipient", singleEmail(config.EMAIL_TEST_TO)],
  ["fixture owner matches email recipient", matchingStagingOwnerEmail(config.EMAIL_TEST_TO, config.STAGING_TEST_EMAIL)],
  ["Google mock-test mode", config.MOCK_TEST_AUTH_MODE === "google"],
  ["Stripe mock-test mode", config.MOCK_TEST_PAYMENT_MODE === "stripe"],
];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const checks = stagingChecks(process.env);
  let passed = 0;
  for (const [name, ok] of checks) {
    if (ok) passed += 1;
    console.log(`${ok ? "✅" : "❌"} ${name}`);
  }
  console.log(`${passed}/${checks.length} staging checks passed`);
  if (passed !== checks.length) process.exitCode = 1;
}
