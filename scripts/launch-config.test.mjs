import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync("scripts/check-launch-config.mjs", "utf8");

test("launch configuration checks production callback origins and Aced sender addresses without printing values", () => {
  assert.match(source, /NEXTAUTH_URL/);
  assert.match(source, /NEXT_PUBLIC_SITE_URL/);
  assert.match(source, /https:\/\/aceditprep\.com/);
  assert.match(source, /EMAIL_SUPPORT/);
  assert.match(source, /aceditprep\\\.com/);
  assert.doesNotMatch(source, /console\.log\([^\n]*config\[/);
});
