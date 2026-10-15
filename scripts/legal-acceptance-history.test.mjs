import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("new affirmative Terms acceptance records the active version and actual timestamp", () => {
  const source = read("app/api/account/consent/route.ts");
  assert.match(source, /insert\(legalTermsAcceptanceHistory\)/);
  assert.match(source, /termsVersion: CURRENT_TERMS_VERSION/);
  assert.match(source, /acceptedAt: now/);
  assert.match(source, /evidenceSource: "affirmative"/);
});

test("repeat Terms acceptance cannot create a misleading duplicate record", () => {
  const source = read("app/api/account/consent/route.ts");
  const schema = read("db/schema.ts");
  assert.match(source, /onConflictDoNothing\(\)/);
  assert.match(schema, /legal_terms_acceptance_history_user_version_idx/);
});

test("legacy consent evidence is preserved as migrated evidence, not a new acceptance", () => {
  const migration = read("drizzle/0033_legal_terms_acceptance_history.sql");
  assert.match(migration, /"agreed_terms_version"/);
  assert.match(migration, /"agreed_terms_at"/);
  assert.match(migration, /'legacy_migrated'/);
  assert.doesNotMatch(migration, /UPDATE\s+"users"|DELETE\s+FROM\s+"users"/i);
});

test("a revised Terms version creates distinct append-only evidence without activating it", () => {
  const schema = read("db/schema.ts");
  const consent = read("lib/account-consent.ts");
  assert.match(schema, /termsVersion: text\("terms_version"\)/);
  assert.match(schema, /uniqueIndex\("legal_terms_acceptance_history_user_version_idx"\)/);
  assert.match(consent, /legal-terms-2026-10-13/);
  assert.doesNotMatch(consent, /legal-terms-2026-10-14/);
});

test("history rows are database-enforced append-only evidence", () => {
  const migration = read("drizzle/0033_legal_terms_acceptance_history.sql");
  assert.match(migration, /ON DELETE RESTRICT/);
  assert.match(migration, /BEFORE UPDATE OR DELETE/);
  assert.match(migration, /append-only/);
});
