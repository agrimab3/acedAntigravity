import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkAppHealth } from "../lib/health.ts";

test("health is ok only when the database query succeeds", async () => {
  assert.equal(await checkAppHealth(null), false);
  assert.equal(await checkAppHealth({ execute: async () => ({}) }), true);
  assert.equal(
    await checkAppHealth({ execute: async () => { throw new Error("db down"); } }),
    false
  );
});

test("public health route exposes only ok/not_ok status", () => {
  const source = readFileSync("app/api/health/route.ts", "utf8");
  assert.match(source, /status: "ok"/);
  assert.match(source, /status: "not_ok"/);
  assert.doesNotMatch(source, /timestamp|DATABASE_URL|error\.message|service:/);
});
