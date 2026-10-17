import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const local = readFileSync("scripts/backup-db.sh", "utf8");
const offsite = readFileSync("scripts/backup-offsite-s3.sh", "utf8");
const runner = readFileSync("scripts/run-production-backup.sh", "utf8");
const restore = readFileSync("scripts/restore-offsite-backup.sh", "utf8");
const deploy = readFileSync("scripts/deploy-vps.sh", "utf8");

test("new daily backups use a restorable custom dump and do not rotate preexisting backups", () => {
  assert.match(local, /--format=custom/);
  assert.match(local, /pg_restore --list/);
  assert.match(local, /ACED_BACKUP_RETENTION_DAYS:-30/);
  assert.match(local, /ACED_BACKUP_PREFIX:-aced-daily-/);
  assert.match(local, /-name "\$\{BACKUP_PREFIX\}\*\.dump"/);
  assert.doesNotMatch(local, /-name 'aced-\*\.dump'/);
});

test("offsite copies are encrypted, verified, and require protected least-privilege configuration", () => {
  assert.match(offsite, /ACED_BACKUP_ENCRYPTION_KEY_FILE/);
  assert.match(offsite, /stat -c '%a'/);
  assert.match(offsite, /--symmetric --cipher-algo AES256/);
  assert.match(offsite, /--decrypt --output \/dev\/null/);
  assert.match(offsite, /sha256sum/);
  assert.match(offsite, /aws s3 cp/);
  assert.match(offsite, /aws s3api head-object/);
  assert.doesNotMatch(offsite, /--acl public-read/);
});

test("scheduled backup is status-recorded and offsite upload remains opt-in", () => {
  assert.match(runner, /ACED_BACKUP_OFFSITE_ENABLED:-false/);
  assert.match(runner, /last-backup-status\.env/);
  assert.match(runner, /write_status failed/);
  assert.match(deploy, /run-production-backup\.sh/);
});

test("offsite restore refuses production-looking targets and checks the decrypted dump", () => {
  assert.match(restore, /Refusing offsite restore to a non-test-looking database/);
  assert.match(restore, /pg_restore --list/);
  assert.match(restore, /Encrypted backup checksum verification failed/);
  assert.match(restore, /restore-backup\.sh/);
  assert.match(restore, /verify-applied-drizzle-migrations\.mjs/);
  assert.doesNotMatch(restore, /ALLOW_PRODUCTION_RESTORE=true/);
});
