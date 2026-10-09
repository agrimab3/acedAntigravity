export type MockTestAuthMode = "test" | "google";
export type MockTestPaymentMode = "test" | "stripe";

export function getMockTestAuthMode(): MockTestAuthMode {
  return process.env.MOCK_TEST_AUTH_MODE === "google" ? "google" : "test";
}

export function getMockTestPaymentMode(): MockTestPaymentMode {
  return process.env.MOCK_TEST_PAYMENT_MODE === "stripe" ? "stripe" : "test";
}

export function isUnsafeProductionMockTestMode() {
  return (
    process.env.NODE_ENV === "production" &&
    (getMockTestAuthMode() === "test" || getMockTestPaymentMode() === "test")
  );
}

export function logUnsafeProductionMockTestMode() {
  if (!isUnsafeProductionMockTestMode()) return;

  console.error(
    "\n🚨 ACED MOCK TEST SAFETY ERROR 🚨\n" +
      "Production started with MOCK_TEST_AUTH_MODE=test or MOCK_TEST_PAYMENT_MODE=test.\n" +
      "Test sign-in/payment routes are disabled. Switch both modes before launch.\n"
  );
}
