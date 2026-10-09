import { getMockTestServerNow } from "../lib/mockTest/devClock.ts";
import { releaseMockTest } from "../lib/mockTest/release.ts";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const args = Object.fromEntries(
  process.argv.slice(2).filter((arg) => arg.startsWith("--")).map((arg) => {
    const [key, ...rest] = arg.slice(2).split("=");
    return [key, rest.join("=") || "true"];
  })
);

const slug = String(args.slug || "2026-12-05");
const includeDev = args["include-dev"] === "1" || args["include-dev"] === "true";

if (includeDev && process.env.NODE_ENV === "production") {
  throw new Error("--include-dev is forbidden in production.");
}

const result = await releaseMockTest({
  connectionString: process.env.DATABASE_URL,
  slug,
  now: getMockTestServerNow(),
  includeDev,
});

console.log(JSON.stringify(result, null, 2));
