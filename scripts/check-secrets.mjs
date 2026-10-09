import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const tracked = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
}).split("\0").filter(Boolean);

const join = (...parts) => parts.join("");

const rules = [
  ["Google API key", new RegExp(join("AI", "za") + "[0-9A-Za-z_-]{30,}", "g")],
  ["Groq API key", new RegExp(join("gsk", "_") + "[A-Za-z0-9_-]{20,}", "g")],
  ["Stripe secret key", new RegExp(join("sk", "_live_") + "[A-Za-z0-9]{16,}", "g")],
  ["Stripe test secret key", new RegExp(join("sk", "_test_") + "[A-Za-z0-9]{16,}", "g")],
  ["Stripe webhook secret", new RegExp(join("wh", "sec_") + "[A-Za-z0-9]{16,}", "g")],
  ["GitHub token", new RegExp(join("gh", "p_") + "[A-Za-z0-9]{20,}", "g")],
  ["GitHub fine-grained token", new RegExp(join("github", "_pat_") + "[A-Za-z0-9_]{20,}", "g")],
  ["Google OAuth client secret", new RegExp(join("GOC", "SPX-") + "[A-Za-z0-9_-]{12,}", "g")],
  ["AWS access key", new RegExp(join("AK", "IA") + "[0-9A-Z]{16}", "g")],
  ["OpenAI-style key", new RegExp(join("sk", "-proj-") + "[A-Za-z0-9_-]{20,}", "g")],
  ["Anthropic key", new RegExp(join("sk", "-ant-") + "[A-Za-z0-9_-]{20,}", "g")],
  ["Private key", new RegExp(join("-----", "BEGIN ") + "(?:RSA |EC |OPENSSH )?PRIVATE KEY-----", "g")],
];

const sensitiveEnvName =
  /(?:^|_)(?:API_KEY|TOKEN|SECRET|PASSWORD|PASS|DATABASE_URL|DB_URL|DATABASE_URI|WEBHOOK_SECRET|PRIVATE_KEY|SERVICE_ROLE_KEY|CLIENT_SECRET)$/i;
const envAssignment =
  /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/;
const placeholderParts = [
  "your_",
  "example",
  "placeholder",
  "changeme",
  "replace_me",
  "dummy",
  "fake",
  "xxxxx",
  "<",
];

function isPlaceholder(value) {
  const normalized = value
    .trim()
    .replace(/^["'`]|["'`]$/g, "")
    .toLowerCase();
  return (
    !normalized ||
    placeholderParts.some((part) => normalized.includes(part)) ||
    ["none", "null", "undefined", "true", "false", "test"].includes(normalized)
  );
}

function lineNumberFor(text, index) {
  return text.slice(0, index).split("\n").length;
}

const findings = [];

for (const file of tracked) {
  let data;
  try {
    data = readFileSync(file);
  } catch {
    continue;
  }
  if (data.subarray(0, 4096).includes(0)) continue;

  const text = data.toString("utf8");

  for (const [label, regex] of rules) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      findings.push({
        file,
        line: lineNumberFor(text, match.index),
        label,
      });
      if (match.index === regex.lastIndex) regex.lastIndex += 1;
    }
  }

  if (/(^|\/)\.env(?:\.|$)/.test(file)) {
    for (const [index, line] of text.split("\n").entries()) {
      const match = line.match(envAssignment);
      if (!match) continue;
      const [, name, rawValue] = match;
      if (!sensitiveEnvName.test(name) || isPlaceholder(rawValue)) continue;

      findings.push({
        file,
        line: index + 1,
        label: `non-placeholder value for ${name}`,
      });
    }
  }
}

if (findings.length > 0) {
  console.error("Secret check failed. Potential secret material found in tracked files:");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} — ${finding.label}`);
  }
  console.error("Move real secrets to .env.local or your hosting provider environment settings.");
  process.exit(1);
}

console.log(`Secret check passed: scanned ${tracked.length} tracked files.`);
