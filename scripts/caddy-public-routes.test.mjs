import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const caddy = readFileSync("deploy/caddy/aced.Caddyfile.template", "utf8");

test("public auth, mock-test, and health routes bypass only the temporary Caddy gate", () => {
  assert.match(caddy, /\/api\/auth\/\*/);
  assert.match(caddy, /\/mock-test\/\*/);
  assert.match(caddy, /\/api\/mock-test\/\*/);
  assert.match(caddy, /\/email\/\*/);
  assert.match(caddy, /\/api\/health/);
  assert.match(caddy, /\/mock-test-rules/);
  assert.match(caddy, /\/accessibility/);
  assert.match(caddy, /handle \{[\s\S]*basicauth[\s\S]*reverse_proxy/);
  assert.doesNotMatch(caddy, /@public path[^\n]*\/dashboard/);
  assert.doesNotMatch(caddy, /@public path[^\n]*\/admin/);
});
