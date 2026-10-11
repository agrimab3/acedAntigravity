import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { encode } from "next-auth/jwt";
import { chromium } from "playwright-core";

const BASE_URL = process.env.PHONE_CHECK_BASE_URL || "http://localhost:3322";
const outRoot = path.resolve("docs/phone-check");
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
if (!secret) throw new Error("AUTH_SECRET/NEXTAUTH_SECRET is required.");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

const pages = [
  ["homepage", "/"],
  ["signin", "/mock-test/auth/signin"],
  ["dashboard", "/dashboard"],
  ["practice", "/practice"],
  ["practice-test", "/practice-tests/run?mode=english"],
  ["progress", "/progress"],
  ["mock-signup", "/mock-test/signup"],
  ["privacy", "/privacy"],
  ["terms", "/terms"],
  ["refunds", "/refunds"],
  ["contact", "/contact"],
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function upsertUser() {
  const row = (
    await client.query(
      `insert into users(email,name,preferred_name,grade_level,act_test_date,target_act_score,
        onboarding_completed_at,walkthrough_completed_at,updated_at)
       values('phone-check@aced.test','Phone Check','Phone','11','2026-12-12',30,now(),now(),now())
       on conflict(email) do update set
         name=excluded.name, preferred_name=excluded.preferred_name, grade_level=excluded.grade_level,
         act_test_date=excluded.act_test_date, target_act_score=excluded.target_act_score,
         onboarding_completed_at=now(), walkthrough_completed_at=now(), updated_at=now()
       returning id,email,name`
    )
  ).rows[0];
  return row;
}

async function resetMock(userId) {
  await client.query(
    `delete from mock_registrations
     where user_id=$1 and mock_test_id=(select id from mock_tests where slug='2026-12-05')`,
    [userId]
  );
  await client.query(
    `update mock_tests
     set status='open',released_at=null,composite_distribution=null
     where slug='2026-12-05'`
  );
}

async function makePaidRegistration(userId) {
  const row = (
    await client.query(
      `insert into mock_registrations(
         mock_test_id,user_id,time_zone,agreed_no_refund_at,paid_at,start_override_until,updated_at
       )
       select id,$1,'America/Los_Angeles',now(),now(),now()+interval '4 hours',now()
       from mock_tests where slug='2026-12-05'
       returning id`,
      [userId]
    )
  ).rows[0];
  return row;
}

async function assess(page, name) {
  return page.evaluate((label) => {
    const width = window.innerWidth;
    const overflow = Math.max(
      document.documentElement.scrollWidth,
      document.body?.scrollWidth || 0
    ) - width;
    const interactive = [...document.querySelectorAll("button,a,input,select,textarea")];
    const unreachable = interactive
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          text: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 80),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter((x) => x.width > 0 && (x.left < -2 || x.right > width + 2))
      .slice(0, 12);
    return { name: label, overflow: Math.round(overflow), unreachable };
  }, name);
}

async function shot(page, dir, name, route, waitFor = 900) {
  await page.goto(BASE_URL + route, { waitUntil: "domcontentloaded", timeout: 30000 });
  await sleep(waitFor);
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await sleep(150);
  let report;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      report = await assess(page, name);
      break;
    } catch (error) {
      if (attempt === 2) throw error;
      await sleep(250);
    }
  }
  await page.screenshot({
    path: path.join(outRoot, dir, name + ".png"),
    fullPage: true,
  });
  return report;
}

async function api(page, route, init = {}) {
  const { body: requestBody, ...requestInit } = init;
  const response = await page.context().request.fetch(BASE_URL + route, {
    ...requestInit,
    data: requestBody,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });
  const text = await response.text();
  let responseBody = null;
  try { responseBody = text ? JSON.parse(text) : null; } catch { responseBody = text; }
  if (!response.ok()) {
    throw new Error(`${response.status()} ${route}: ${text.slice(0, 300)}`);
  }
  return responseBody;
}

async function capturePass(dir, browser, user) {
  fs.mkdirSync(path.join(outRoot, dir), { recursive: true });

  const publicContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const publicPage = await publicContext.newPage();
  const reports = [];
  reports.push(await shot(publicPage, dir, "homepage", "/", 1200));
  reports.push(await shot(publicPage, dir, "signin", "/mock-test/auth/signin"));
  for (const [name, route] of pages.slice(7)) {
    reports.push(await shot(publicPage, dir, name, route));
  }
  await publicContext.close();

  const token = await encode({
    secret,
    maxAge: 7200,
    token: { sub: user.id, appUserId: user.id, email: user.email, name: user.name },
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await context.addCookies([
    {
      name: "next-auth.session-token",
      value: token,
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage();

  reports.push(await shot(page, dir, "dashboard", "/dashboard", 1500));
  reports.push(await shot(page, dir, "practice", "/practice", 1200));
  reports.push(await shot(page, dir, "practice-test", "/practice-tests/run?mode=english", 1800));
  reports.push(await shot(page, dir, "progress", "/progress", 1200));

  await resetMock(user.id);
  reports.push(await shot(page, dir, "mock-signup", "/mock-test/signup", 1200));
  await makePaidRegistration(user.id);

  await page.goto(BASE_URL + "/mock-test/run", { waitUntil: "domcontentloaded" });
  let sessionBody = await api(page, "/api/mock-test/session", {
    method: "POST",
    body: "{}",
  });
  let session = sessionBody.session;

  await api(page, "/api/mock-test/session/complete-section?devTransitionSeconds=1", {
    method: "POST",
    body: JSON.stringify({ sessionId: session.sessionId, outboxEmpty: true }),
  });
  await sleep(1250);
  session = (await api(page, "/api/mock-test/session")).session;
  if (session.currentSectionOrder !== 1) throw new Error("Could not advance to Math.");

  await page.goto(BASE_URL + "/mock-test/run", { waitUntil: "domcontentloaded" });
  await sleep(1800);
  const calculatorButton = page.getByRole("button", { name: "calculator" });
  if ((await calculatorButton.count()) === 0) {
    const bodyText = (await page.locator("body").innerText()).slice(0, 800);
    throw new Error("Math screen did not render calculator. Page says: " + bodyText);
  }
  await calculatorButton.click();
  await page.locator("[data-calculator-panel]").waitFor({ state: "visible" });
  reports.push(await assess(page, "mock-test-calculator"));
  await page.screenshot({
    path: path.join(outRoot, dir, "mock-test-calculator.png"),
    fullPage: true,
  });

  session = (await api(page, "/api/mock-test/session")).session;
  await api(page, "/api/mock-test/session/complete-section?devBreakSeconds=120", {
    method: "POST",
    body: JSON.stringify({ sessionId: session.sessionId, outboxEmpty: true }),
  });
  await page.goto(BASE_URL + "/mock-test/run", { waitUntil: "domcontentloaded" });
  await page.getByText(/break ends in/i).waitFor({ timeout: 15000 });
  reports.push(await assess(page, "mock-test-break"));
  await page.screenshot({
    path: path.join(outRoot, dir, "mock-test-break.png"),
    fullPage: true,
  });

  await api(page, "/api/mock-test/dev/bypass-break", { method: "POST", body: "{}" });
  session = (await api(page, "/api/mock-test/session")).session;
  if (session.currentSectionOrder !== 2) throw new Error("Could not advance to Reading.");
  await api(page, "/api/mock-test/session/complete-section?devTransitionSeconds=1", {
    method: "POST",
    body: JSON.stringify({ sessionId: session.sessionId, outboxEmpty: true }),
  });
  await sleep(1250);
  session = (await api(page, "/api/mock-test/session")).session;
  if (session.currentSectionOrder !== 3) throw new Error("Could not advance to Science.");
  await api(page, "/api/mock-test/session/complete-section", {
    method: "POST",
    body: JSON.stringify({ sessionId: session.sessionId, outboxEmpty: true }),
  });

  reports.push(await shot(page, dir, "mock-test-finished", "/mock-test/run/finished", 1200));

  await api(page, "/api/mock-test/dev/release-results", { method: "POST", body: "{}" });
  await page.addInitScript(() => {
    localStorage.setItem("aced-mock-reveal-seen-2026-12-05", "1");
  });
  reports.push(
    await shot(page, dir, "mock-test-results", "/mock-test/results?previewReleased=1", 1800)
  );

  await context.close();
  await resetMock(user.id);
  return reports;
}

await client.connect();
const user = await upsertUser();
await resetMock(user.id);
const browser = await chromium.launch({ headless: true, executablePath: chrome });
try {
  const dir = process.argv.includes("--after") ? "after" : "before";
  const reports = await capturePass(dir, browser, user);
  fs.writeFileSync(
    path.join(outRoot, dir + "-report.json"),
    JSON.stringify(reports, null, 2)
  );
  const failures = reports.filter(
    (item) => item.overflow > 2 || item.unreachable.length > 0
  );
  console.log(
    JSON.stringify(
      {
        dir,
        screenshots: reports.length,
        failures,
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
  await resetMock(user.id);
  await client.end();
}
