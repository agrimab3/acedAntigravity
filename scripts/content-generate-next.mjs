import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pg from "pg";
import {
  CONTENT_DIFFICULTIES,
  getCellTarget,
} from "../lib/content-inventory-targets.mjs";

const execFileAsync = promisify(execFile);
const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split("=");
      return [key, rest.join("=") || "true"];
    })
);

const scope = (args.scope || "mock_reserve").trim().toLowerCase();
const limit = Math.min(24, Math.max(1, Number(args.limit || 6)));
const dryRun = args["dry-run"] === "1" || args["dry-run"] === "true";
const provider = args.provider?.trim() || process.env.CONTENT_GENERATION_PROVIDER?.trim() || "gemini";
const model = args.model?.trim();

if (!["practice", "mock_reserve"].includes(scope)) {
  throw new Error("--scope must be practice or mock_reserve.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function buildDifficultyPlan(counts) {
  return CONTENT_DIFFICULTIES.map((difficulty) => `${difficulty}:${counts[difficulty] ?? 0}`).join(",");
}

function extractJsonSummary(stdout) {
  const lines = stdout.trim().split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!lines[index].trim().startsWith("{")) continue;
    try {
      return JSON.parse(lines.slice(index).join("\n"));
    } catch {
      // Keep scanning backward for the final JSON object.
    }
  }
  throw new Error("Generator did not return a JSON summary.");
}

try {
  const [topicsResult, countsResult] = await Promise.all([
    pool.query(`
      select id, section_key, slug, name, display_order
      from act_topics
      where is_active = true
      order by section_key, display_order
    `),
    pool.query(`
      select
        q.topic_id,
        q.difficulty,
        count(*) filter (where q.status = 'published')::int as published_count,
        count(*) filter (where q.status = 'draft')::int as draft_count
      from questions q
      inner join act_topics t on t.id = q.topic_id
      where t.is_active = true
        and q.usage_scope = $1
      group by q.topic_id, q.difficulty
    `, [scope]),
  ]);

  const topics = topicsResult.rows;
  const topicCountBySection = new Map();
  for (const topic of topics) {
    topicCountBySection.set(
      topic.section_key,
      (topicCountBySection.get(topic.section_key) ?? 0) + 1
    );
  }

  const countsByCell = new Map();
  for (const row of countsResult.rows) {
    countsByCell.set(`${row.topic_id}::${row.difficulty}`, {
      published: Number(row.published_count),
      draft: Number(row.draft_count),
    });
  }

  const topicPlans = topics.map((topic) => {
    const activeTopicCount = topicCountBySection.get(topic.section_key) ?? 1;
    const gaps = { easy: 0, medium: 0, hard: 0 };
    for (const difficulty of CONTENT_DIFFICULTIES) {
      const cell = countsByCell.get(`${topic.id}::${difficulty}`) ?? {
        published: 0,
        draft: 0,
      };
      const target = getCellTarget({
        scope,
        sectionKey: topic.section_key,
        activeTopicCount,
      });
      gaps[difficulty] = Math.max(0, target - cell.published - cell.draft);
    }
    return {
      ...topic,
      gaps,
      totalGap: gaps.easy + gaps.medium + gaps.hard,
      maxGap: Math.max(gaps.easy, gaps.medium, gaps.hard),
    };
  });

  topicPlans.sort((left, right) => {
    if (right.maxGap !== left.maxGap) return right.maxGap - left.maxGap;
    if (right.totalGap !== left.totalGap) return right.totalGap - left.totalGap;
    if (left.section_key !== right.section_key) {
      return left.section_key.localeCompare(right.section_key);
    }
    return left.display_order - right.display_order;
  });

  let remaining = limit;
  const jobs = [];

  for (const topic of topicPlans) {
    if (remaining <= 0) break;
    if (topic.totalGap <= 0) continue;

    const jobSize = Math.min(
      remaining,
      topic.totalGap,
      topic.section_key === "reading" || topic.section_key === "science" ? 6 : 3
    );

    const requested = { easy: 0, medium: 0, hard: 0 };
    const priority = [...CONTENT_DIFFICULTIES].sort((left, right) => {
      if (topic.gaps[right] !== topic.gaps[left]) return topic.gaps[right] - topic.gaps[left];
      const order = { hard: 3, medium: 2, easy: 1 };
      return order[right] - order[left];
    });

    let slots = jobSize;
    while (slots > 0) {
      let placed = false;
      for (const difficulty of priority) {
        if (requested[difficulty] >= topic.gaps[difficulty]) continue;
        requested[difficulty] += 1;
        slots -= 1;
        placed = true;
        if (slots <= 0) break;
      }
      if (!placed) break;
    }

    const requestedCount = requested.easy + requested.medium + requested.hard;
    if (requestedCount === 0) continue;

    jobs.push({
      sectionKey: topic.section_key,
      topicSlug: topic.slug,
      topicName: topic.name,
      difficultyPlan: requested,
      requestedCount,
    });
    remaining -= requestedCount;
  }

  if (jobs.length === 0) {
    console.log(`No ${scope} generation gaps remain.`);
    process.exit(0);
  }

  console.log(`\nACED generate-next plan: ${scope}, max ${limit} candidate children\n`);
  for (const job of jobs) {
    console.log(
      `- ${job.sectionKey}/${job.topicSlug}: ${buildDifficultyPlan(job.difficultyPlan)} (${job.requestedCount})`
    );
  }

  if (dryRun) {
    console.log("\nDry run only. No generation was started.");
    process.exit(0);
  }

  const results = [];
  for (const job of jobs) {
    const childArgs = [
      "generate-questions.mjs",
      `--section=${job.sectionKey}`,
      `--topic=${job.topicSlug}`,
      `--difficulty-plan=${buildDifficultyPlan(job.difficultyPlan)}`,
      "--status=draft",
      `--usage-scope=${scope}`,
      "--delay-ms=0",
      "--json=1",
    ];
    if (provider) childArgs.push(`--provider=${provider}`);
    if (model) childArgs.push(`--model=${model}`);

    console.log(`\nGenerating ${job.sectionKey}/${job.topicSlug}...`);
    try {
      const child = await execFileAsync("node", childArgs, {
        cwd: process.cwd(),
        env: process.env,
        timeout: 300000,
        maxBuffer: 1024 * 1024 * 6,
      });
      const summary = extractJsonSummary(child.stdout);
      results.push({
        ...job,
        inserted: Number(summary.inserted ?? 0),
        skipped: Number(summary.skipped ?? 0),
        reviewRejected: Number(summary.reviewRejected ?? 0),
        reviewErrors: Number(summary.reviewErrors ?? 0),
        runState: summary.runState ?? "unknown",
        pauseReason: summary.pauseReason ?? null,
        provider: summary.provider ?? null,
        model: summary.model ?? null,
      });
    } catch (error) {
      results.push({
        ...job,
        inserted: 0,
        error: error instanceof Error ? error.message : "unknown generation error",
      });
    }
  }

  console.log("\nGeneration batch summary:");
  console.log(JSON.stringify({
    scope,
    requestedLimit: limit,
    jobs: results,
    inserted: results.reduce((sum, result) => sum + Number(result.inserted ?? 0), 0),
  }, null, 2));

  if (results.some((result) => result.error || result.runState === "paused_due_to_provider")) {
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
