import { spawnSync } from "node:child_process";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split("=");
      return [key, rest.join("=") || "true"];
    })
);

const reserveLimit = Math.min(12, Math.max(0, Number(args["reserve-limit"] ?? 6)));
const practiceLimit = Math.min(12, Math.max(0, Number(args["practice-limit"] ?? 6)));
const dryRun = args["dry-run"] === "1" || args["dry-run"] === "true";
const provider = args.provider?.trim() || process.env.CONTENT_GENERATION_PROVIDER?.trim() || "gemini";

if (reserveLimit + practiceLimit > 12) {
  throw new Error("Nightly generation is capped at 12 candidate children total.");
}

function runScope(scope, limit) {
  if (limit <= 0) return true;

  const childArgs = [
    "scripts/content-generate-next.mjs",
    `--scope=${scope}`,
    `--limit=${limit}`,
    `--provider=${provider}`,
  ];
  if (dryRun) childArgs.push("--dry-run=1");

  const result = spawnSync("node", childArgs, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  return result.status === 0;
}

console.log(
  `ACED nightly content factory · reserve=${reserveLimit} · practice=${practiceLimit} · provider=${provider}${dryRun ? " · dry run" : ""}`
);

const reserveOk = runScope("mock_reserve", reserveLimit);
if (!reserveOk) {
  console.error("Mock-reserve generation did not complete cleanly. Stopping before practice generation.");
  process.exit(1);
}

const practiceOk = runScope("practice", practiceLimit);
if (!practiceOk) {
  console.error("Practice generation did not complete cleanly.");
  process.exit(1);
}

console.log("Nightly content factory completed.");
