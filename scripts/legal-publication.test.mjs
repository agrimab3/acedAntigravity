import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(file, "utf8");
const legalPage = read("app/legal/page.tsx");
const legalContent = read("components/LegalContent.tsx");
const publicSite = read("components/PublicSite.tsx");
const consent = read("lib/account-consent.ts");
const signup = read("app/mock-test/signup/SignupForm.tsx");

test("all five finalized October 14 legal documents are the legal page source", () => {
  for (const file of ["01-terms-of-service.md", "02-privacy-policy.md", "03-refund-and-payment-policy.md", "04-mock-test-rules.md", "05-accessibility-statement.md"]) {
    assert.match(legalPage, new RegExp(file.replace(/\./g, "\\.")));
    assert.match(read(`docs/legal-drafts/${file}`), /October 14, 2026/);
  }
  assert.match(legalContent, /mock-test-rules/);
  assert.match(legalContent, /accessibility/);
  assert.match(legalContent, /on this page/);
});

test("legal navigation reaches all five documents from the footer and checkout", () => {
  assert.match(publicSite, /legal\?tab=mock-test-rules/);
  assert.match(publicSite, /legal\?tab=accessibility/);
  assert.match(signup, /legal\?tab=refunds/);
  assert.match(signup, /legal\?tab=mock-test-rules/);
});

test("finalized numeric section headings render exactly once in navigation and document headings", () => {
  for (const file of ["01-terms-of-service.md", "02-privacy-policy.md", "03-refund-and-payment-policy.md", "04-mock-test-rules.md", "05-accessibility-statement.md"]) {
    assert.match(read(`docs/legal-drafts/${file}`), /^## 1\. /m);
  }
  assert.match(legalContent, /document\.sections\.map\(\(section\) => <a key=\{section\.heading\} href=/);
  assert.match(legalContent, /<h3 id=\{slug\(section\.heading\)\}>\{section\.heading\}<\/h3>/);
  assert.doesNotMatch(legalContent, /<i>\{index \+ 1\}/);
});

test("October 14 Terms are active without rewriting historical consent evidence", () => {
  assert.match(consent, /legal-terms-2026-10-14/);
  assert.match(read("scripts/legal-acceptance-history.test.mjs"), /append-only evidence/);
  assert.doesNotMatch(read("app/api/account/consent/route.ts"), /delete\(legalTermsAcceptanceHistory\)|update\(legalTermsAcceptanceHistory\)/);
});
