import { Client } from "pg";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DEFAULT_GROQ_MODEL, resolvePreferredGroqModel } from "../lib/groq-models.ts";

const execFileAsync = promisify(execFile);

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
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

const sections = (args.sections || "reading,science")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const targetCount = Math.max(3, Number(args.target || 10));
const topicSleepMs = Math.max(0, Number(args["topic-sleep-ms"] || 75000));
const status = (args.status || "draft").trim().toLowerCase();
const generationProvider = (
  args.provider ||
  process.env.QUESTION_GENERATION_PROVIDER ||
  process.env.CONTENT_GENERATION_PROVIDER ||
  (process.env.GROQ_API_KEY ? "groq" : "gemini")
)
  .trim()
  .toLowerCase();
const generationModel = resolveGenerationModel(generationProvider, args.model);

if (!["draft", "published"].includes(status)) {
  throw new Error(`Invalid status: ${status}`);
}

const client = new Client({
  connectionString: databaseUrl,
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveGenerationModel(provider, rawModel) {
  if (provider === "groq") {
    return resolvePreferredGroqModel(
      rawModel,
      process.env.GROQ_GENERATION_MODEL,
      process.env.GROQ_MODEL,
      DEFAULT_GROQ_MODEL
    );
  }

  if (rawModel?.trim()) {
    return rawModel.trim();
  }

  return process.env.GEMINI_GENERATION_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
}

function extractJsonSummary(stdout) {
  const lines = stdout.trim().split("\n");
  const startIndex = lines.findIndex((line) => line.trim().startsWith("{"));

  if (startIndex === -1) {
    throw new Error("Backlog generation did not return JSON.");
  }

  return JSON.parse(lines.slice(startIndex).join("\n"));
}

async function getBacklogTopics() {
  const result = await client.query(
    `
      select
        t.section_key,
        t.slug,
        t.name,
        coalesce(sum(case when q.status = 'draft' then 1 else 0 end), 0)::int as draft_count,
        coalesce(sum(case when q.status = 'published' then 1 else 0 end), 0)::int as published_count
      from act_topics t
      left join questions q on q.topic_id = t.id
      where t.is_active = true
        and t.section_key = any($1::text[])
      group by t.section_key, t.slug, t.name, t.display_order
      order by t.section_key, t.display_order
    `,
    [sections]
  );

  return result.rows;
}

async function run() {
  await client.connect();

  try {
    const topics = await getBacklogTopics();
    const summary = {
      model: generationModel,
      provider: generationProvider,
      targetCount,
      topicsQueued: 0,
      inserted: 0,
      skipped: 0,
      failures: [],
    };

    for (const topic of topics) {
      const currentCount = Number(topic.published_count) + Number(topic.draft_count);

      if (currentCount >= targetCount) {
        continue;
      }

      const perDifficulty = Math.max(1, Math.ceil((targetCount - currentCount) / 3));
      summary.topicsQueued += 1;

      console.log(
        `Running backlog for ${topic.section_key}/${topic.slug} with perDifficulty=${perDifficulty} using ${generationModel}.`
      );

      try {
        const child = await execFileAsync(
          "node",
          [
            "generate-questions.mjs",
            `--section=${topic.section_key}`,
            `--topic=${topic.slug}`,
            `--per-difficulty=${perDifficulty}`,
            `--status=${status}`,
            `--provider=${generationProvider}`,
            `--model=${generationModel}`,
            "--delay-ms=0",
            "--json=1",
          ],
          {
            cwd: process.cwd(),
            env: process.env,
            timeout: 240000,
            maxBuffer: 1024 * 1024 * 4,
          }
        );

        const childSummary = extractJsonSummary(child.stdout);
        summary.inserted += Number(childSummary.inserted ?? 0);
        summary.skipped += Number(childSummary.skipped ?? 0);

        if (topicSleepMs > 0) {
          await sleep(topicSleepMs);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown backlog error";
        summary.failures.push({
          topic: `${topic.section_key}/${topic.slug}`,
          error: message,
        });
        console.error(`Backlog failed for ${topic.section_key}/${topic.slug}: ${message}`);
      }
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
