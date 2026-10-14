import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
test("consent records age, Terms version, and only updates missing confirmations", () => {
  const source = read("app/api/account/consent/route.ts");
  assert.match(source, /ageConfirmed: z\.literal\(true\)/);
  assert.match(source, /termsVersion: z\.literal\(CURRENT_TERMS_VERSION\)/);
  assert.match(source, /agreedTermsAt: status\.missingTermsAcceptance \? now : undefined/);
  assert.match(source, /ageConfirmedAt: status\.missingAgeConfirmation \? now : undefined/);
});
test("eligibility is database-backed and legacy records require current version", () => {
  const source = read("lib/account-consent.ts");
  assert.match(source, /users\.ageConfirmedAt/);
  assert.match(source, /user\?\.agreedTermsVersion !== CURRENT_TERMS_VERSION/);
  assert.doesNotMatch(source, /localStorage/);
});
test("learning and mock-test routes use the eligibility gate", () => {
  for (const path of ["app/api/onboarding/route.ts", "app/api/questions/route.ts", "app/api/tutor/route.ts", "lib/mockTest/auth.ts"]) {
    assert.match(read(path), /getEligibleAccountSession/);
  }
});
test("deletion requests are authenticated requests, not automatic deletion", () => {
  const source = read("app/api/account/deletion-request/route.ts");
  assert.match(source, /getAccountConsentStatus/);
  assert.match(source, /confirm: z\.literal\(true\)/);
  assert.doesNotMatch(source, /\.delete\(users\)/);
});
