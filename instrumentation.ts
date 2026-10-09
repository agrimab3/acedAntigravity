import { logUnsafeProductionMockTestMode, isUnsafeProductionMockTestMode } from "@/lib/mockTest/mode";

export async function register() {
  if (isUnsafeProductionMockTestMode()) {
    logUnsafeProductionMockTestMode();
    throw new Error(
      "ACED Mock Test test auth/payment mode cannot run in production."
    );
  }
}
