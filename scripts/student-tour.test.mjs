import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tour = readFileSync("components/StudentTour.tsx", "utf8");
const dashboard = readFileSync("app/dashboard/dashboard-client.tsx", "utf8");
const onboardingApi = readFileSync("app/api/onboarding/route.ts", "utf8");

test("student tour defines the cross-page stops and skips optional live lessons", () => {
  for (const stop of ["universe", "bright-star", "filters", "live-lesson", "mock-tile", "practice-tests", "progress", "mock-test"]) {
    assert.match(tour, new RegExp(`id: "${stop}"`));
  }
  assert.match(tour, /optional: true/);
  assert.match(tour, /document\.querySelector/);
  assert.match(tour, /skipMissing\(\)/);
});

test("student tour matches the designed spotlight, delayed tooltip, welcome, and finish states", () => {
  assert.match(tour, /MOTION_MS = 600/);
  assert.match(tour, /cubic-bezier\(\.65,0,\.35,1\)/);
  assert.match(tour, /setTooltipVisible\(true\)/);
  assert.match(tour, /student-tour-page-fade/);
  assert.match(tour, /Welcome to Aced!/);
  assert.match(tour, /Maybe later/);
  assert.match(tour, /You’re all set! ✦/);
  assert.match(tour, /prefers-reduced-motion/);
  assert.match(tour, /data-tour-nav/);
});

test("student tour persists completion server-side and supports Escape and replay", () => {
  assert.match(tour, /method: "PATCH"/);
  assert.match(tour, /walkthroughCompleted: true/);
  assert.match(tour, /event\.key === "Escape"/);
  assert.match(tour, /aced:tour:start/);
  assert.match(onboardingApi, /walkthroughCompletedAt: now/);
  assert.match(dashboard, /Take the tour/);
});
