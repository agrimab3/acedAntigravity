export type MockTestAuthMode = "test" | "google" | "disabled";
export type MockTestPaymentMode = "test" | "stripe" | "disabled";

export const MOCK_TEST_SIGNUPS_SOON_MESSAGE = "Signups open soon ✦";

export function getMockTestAuthMode(): MockTestAuthMode {
  const configured = process.env.MOCK_TEST_AUTH_MODE;
  if (process.env.NODE_ENV === "production") {
    return configured === "google" ? "google" : "disabled";
  }
  return configured === "google" ? "google" : "test";
}

export function getMockTestPaymentMode(): MockTestPaymentMode {
  const configured = process.env.MOCK_TEST_PAYMENT_MODE;
  if (process.env.NODE_ENV === "production") {
    return configured === "stripe" ? "stripe" : "disabled";
  }
  return configured === "stripe" ? "stripe" : "test";
}

export function isMockTestSignupEnabled() {
  if (process.env.NODE_ENV !== "production") return true;
  return getMockTestAuthMode() === "google" && getMockTestPaymentMode() === "stripe";
}

export function isUnsafeProductionMockTestMode() {
  return process.env.NODE_ENV === "production" && !isMockTestSignupEnabled();
}

export function logUnsafeProductionMockTestMode() {
  if (!isUnsafeProductionMockTestMode()) return;

  console.error(
    "\n🚨 ACED MOCK TEST SAFETY ERROR 🚨\n" +
      "Production mock-test signup is disabled because auth/payment mode is missing or unsafe.\n" +
      "Set MOCK_TEST_AUTH_MODE=google and MOCK_TEST_PAYMENT_MODE=stripe before launch.\n"
  );
}
