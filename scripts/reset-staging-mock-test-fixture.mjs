#!/usr/bin/env node
// Deliberately destructive only after an explicit --confirm on the isolated staging database.
import { Client } from "pg";

const TEST_SLUG = "2026-12-05";
const confirm = process.argv.includes("--confirm");

function requireStaging() {
  if (process.env.ACED_DEPLOYMENT_ENV !== "staging") throw new Error("Refusing reset outside ACED_DEPLOYMENT_ENV=staging.");
  if (process.env.NODE_ENV !== "production") throw new Error("Refusing reset unless staging runs with NODE_ENV=production.");
  if (!process.env.STAGING_TEST_EMAIL || process.env.STAGING_TEST_EMAIL !== process.env.EMAIL_TEST_TO) {
    throw new Error("STAGING_TEST_EMAIL must exactly match EMAIL_TEST_TO.");
  }
  const url = new URL(process.env.DATABASE_URL || "");
  if (url.pathname !== "/aced_staging" || url.username !== "aced_staging") {
    throw new Error("Refusing reset unless DATABASE_URL targets the isolated aced_staging database and user.");
  }
}

requireStaging();
if (!confirm) {
  console.log("Dry run only. Re-run with --confirm after verifying the isolated staging database.");
  process.exit(0);
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const identity = await client.query("select current_database() as database_name, current_user as database_user");
  if (identity.rows[0]?.database_name !== "aced_staging" || identity.rows[0]?.database_user !== "aced_staging") {
    throw new Error("Connected database identity does not match the staging-only reset guard.");
  }
  await client.query("begin");
  const registrations = await client.query(
    `select mr.id
       from mock_registrations mr
       join mock_tests mt on mt.id=mr.mock_test_id
       join users u on u.id=mr.user_id
      where mt.slug=$1 and lower(u.email)=lower($2)`,
    [TEST_SLUG, process.env.STAGING_TEST_EMAIL],
  );
  const ids = registrations.rows.map((row) => row.id);
  if (ids.length) {
    await client.query("delete from mock_email_outbox where registration_id = any($1::uuid[])", [ids]);
    await client.query("delete from mock_stripe_events where registration_id = any($1::uuid[])", [ids]);
    await client.query("delete from mock_test_ops_events where registration_id = any($1::uuid[])", [ids]);
    await client.query("delete from mock_registrations where id = any($1::uuid[])", [ids]);
  }
  await client.query(
    `delete from mock_waitlist mw using mock_tests mt
      where mw.mock_test_id=mt.id and mt.slug=$1 and lower(mw.email)=lower($2)`,
    [TEST_SLUG, process.env.STAGING_TEST_EMAIL],
  );
  await client.query("commit");
  console.log(`Staging fixture reset complete: registrations=${ids.length}`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
