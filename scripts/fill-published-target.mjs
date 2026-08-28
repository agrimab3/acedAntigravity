import { Client } from "pg";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  resolveGenerationModel,
  resolveGenerationProvider,
} from "../lib/content-generation-providers.mjs";

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

const sections = (args.sections || "english,math,reading,science")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const targetCount = Math.max(1, Number(args.target || 10));
const maxPasses = Math.max(1, Number(args["max-passes"] || 5));
const topicSleepMs = Math.max(0, Number(args["topic-sleep-ms"] || 1500));
const generationProvider = resolveGenerationProvider(args.provider);
const generationModel = resolveGenerationModel(generationProvider, args.model);

const client = new Client({
  connectionString: databaseUrl,
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractJsonSummary(stdout) {
  const lines = stdout.trim().split("\n");
  const startIndex = lines.findIndex((line) => line.trim().startsWith("{"));

  if (startIndex === -1) {
    throw new Error("Generation script did not return JSON.");
  }

  return JSON.parse(lines.slice(startIndex).join("\n"));
}

async function getActiveTopics() {
  const result = await client.query(
    `
      select
        t.section_key,
        t.slug,
        t.name,
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

async function getPublishedCount(sectionKey, topicSlug) {
  const result = await client.query(
    `
      select
        coalesce(sum(case when q.status = 'published' then 1 else 0 end), 0)::int as published_count
      from act_topics t
      left join questions q on q.topic_id = t.id
      where t.section_key = $1
        and t.slug = $2
      group by t.id
    `,
    [sectionKey, topicSlug]
  );

  return Number(result.rows[0]?.published_count ?? 0);
}

async function fillTopic(sectionKey, topicSlug) {
  let currentPublished = await getPublishedCount(sectionKey, topicSlug);
  let passes = 0;
  let inserted = 0;
  let skipped = 0;

  while (currentPublished < targetCount && passes < maxPasses) {
    passes += 1;

    const child = await execFileAsync(
      "node",
      [
        "generate-questions.mjs",
        `--section=${sectionKey}`,
        `--topic=${topicSlug}`,
        "--per-difficulty=1",
        "--status=published",
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

    const summary = extractJsonSummary(child.stdout);
    inserted += Number(summary.inserted ?? 0);
    skipped += Number(summary.skipped ?? 0);

    if (Number(summary.inserted ?? 0) === 0) {
      break;
    }

    currentPublished = await getPublishedCount(sectionKey, topicSlug);

    if (topicSleepMs > 0) {
      await sleep(topicSleepMs);
    }
  }

  return {
    sectionKey,
    topicSlug,
    passes,
    publishedCount: currentPublished,
    inserted,
    skipped,
  };
}

async function run() {
  await client.connect();

  try {
    const topics = await getActiveTopics();
    const summary = {
      targetCount,
      model: generationModel,
      provider: generationProvider,
      topicsProcessed: 0,
      results: [],
      failures: [],
    };

    for (const topic of topics) {
      const publishedCount = Number(topic.published_count ?? 0);

      if (publishedCount >= targetCount) {
        continue;
      }

      try {
        console.log(
          `Filling ${topic.section_key}/${topic.slug} from ${publishedCount} to ${targetCount} published questions.`
        );
        const result = await fillTopic(topic.section_key, topic.slug);
        summary.topicsProcessed += 1;
        summary.results.push(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown fill error";
        summary.failures.push({
          topic: `${topic.section_key}/${topic.slug}`,
          error: message,
        });
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
