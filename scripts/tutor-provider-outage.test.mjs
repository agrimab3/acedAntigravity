import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("tutor shows a friendly temporary message when providers are unavailable", () => {
  const aiSource = readFileSync("lib/tutor-ai.ts", "utf8");
  const routeSource = readFileSync("app/api/tutor/route.ts", "utf8");

  assert.match(
    aiSource,
    /The tutor is taking a quick break, try again in a minute/
  );
  assert.match(routeSource, /TUTOR_UNAVAILABLE_MESSAGE/);
  assert.match(routeSource, /unavailable:\s*true/);
  assert.match(routeSource, /provider:\s*"unavailable"/);
  assert.doesNotMatch(
    routeSource.slice(routeSource.indexOf("} catch (error)")),
    /reply:\s*fallbackReply/
  );
});
