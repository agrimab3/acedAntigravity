import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const files = readdirSync("scripts")
  .filter((name) => /\.test\.(?:mjs|js|ts)$/.test(name))
  .sort();

if (files.length === 0) {
  console.error("No scripts/*.test.* files found.");
  process.exit(1);
}

for (const name of files) {
  console.log(`\n=== scripts/${name} ===`);
  const args = ["--test"];
  if (name.endsWith(".ts")) args.push("--experimental-strip-types");
  args.push(path.join("scripts", name));
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`\nAll ${files.length} test files passed.`);
