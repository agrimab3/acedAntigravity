import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("DEV break bypass hard-404s in production before any mode/helper checks", () => {
  const source = readFileSync(
    new URL("../app/api/mock-test/dev/bypass-break/route.ts", import.meta.url),
    "utf8"
  );

  const productionGuard = source.indexOf(
    'if (process.env.NODE_ENV === "production")'
  );
  const production404 = source.indexOf(
    'return NextResponse.json({ error: "Not found." }, { status: 404 });',
    productionGuard
  );
  const helperCheck = source.indexOf("if (!canBypassMockEventWindow())");

  assert.notEqual(productionGuard, -1, "missing explicit production NODE_ENV guard");
  assert.notEqual(production404, -1, "production guard must return 404");
  assert.notEqual(helperCheck, -1, "missing normal dev-mode bypass guard");
  assert.ok(
    productionGuard < helperCheck,
    "production 404 must run before any env-mode/helper bypass logic"
  );
  assert.ok(
    production404 < helperCheck,
    "production request must terminate with 404 before mode variables can matter"
  );
});
