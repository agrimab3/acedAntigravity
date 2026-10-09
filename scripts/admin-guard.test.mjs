import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const adminFiles = [
  ...walk("app/admin").filter((f) => f.endsWith("/page.tsx")),
  ...walk("app/api/admin").filter((f) => f.endsWith("/route.ts")),
].sort();

test("every admin page and API uses a server ADMIN_EMAILS-backed helper", () => {
  const generalHelper = fs.readFileSync("lib/admin.ts", "utf8");
  const mockHelper = fs.readFileSync("lib/admin/mockTestAdmin.ts", "utf8");
  assert.match(generalHelper, /process\.env\.ADMIN_EMAILS/);
  assert.match(mockHelper, /process\.env\.ADMIN_EMAILS/);
  assert.doesNotMatch(generalHelper, /REPO_ADMIN_EMAILS|@aced\.test|local-test-user/);

  const failures = [];
  for (const file of adminFiles) {
    const source = fs.readFileSync(file, "utf8");
    if (!/getAdminSession|requireMockTestAdminPage|requireMockTestAdminApi|getMockTestAdminSession/.test(source)) {
      failures.push(file);
    }
  }
  assert.deepEqual(failures, []);
});
