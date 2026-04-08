import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";

const execFileAsync = promisify(execFile);

const generateSchema = z.object({
  sectionKey: z.enum(["english", "math", "reading", "science"]),
  topicSlug: z.string().trim().min(1),
  perDifficulty: z.coerce.number().int().min(1).max(3).default(1),
  status: z.enum(["draft", "published"]).default("draft"),
});

export async function GET() {
  const session = await getAdminSession();
  const db = getDb();

  if (!session || !db) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await db.execute(sql`
    select
      t.section_key as "sectionKey",
      t.slug as "topicSlug",
      t.name as "topicName",
      coalesce(sum(case when q.status = 'draft' then 1 else 0 end), 0)::int as "draftCount",
      coalesce(sum(case when q.status = 'published' then 1 else 0 end), 0)::int as "publishedCount",
      coalesce(sum(case when q.status = 'rejected' then 1 else 0 end), 0)::int as "rejectedCount"
    from act_topics t
    left join questions q on q.topic_id = t.id
    where t.is_active = true
    group by t.section_key, t.slug, t.name, t.display_order
    order by t.section_key, t.display_order
  `);

  const topics = result.rows.map((row) => ({
    sectionKey: String(row.sectionKey),
    topicSlug: String(row.topicSlug),
    topicName: String(row.topicName),
    draftCount: Number(row.draftCount ?? 0),
    publishedCount: Number(row.publishedCount ?? 0),
    rejectedCount: Number(row.rejectedCount ?? 0),
    targetCount: 9,
  }));

  return NextResponse.json({ topics });
}

function extractJsonSummary(stdout: string) {
  const lines = stdout.trim().split("\n");
  const startIndex = lines.findIndex((line) => line.trim().startsWith("{"));

  if (startIndex === -1) {
    throw new Error("Generation script did not return a JSON summary.");
  }

  return JSON.parse(lines.slice(startIndex).join("\n"));
}

export async function POST(request: Request) {
  const session = await getAdminSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = generateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid generation request." }, { status: 400 });
  }

  try {
    const child = await execFileAsync(
      "node",
      [
        "generate-questions.mjs",
        `--section=${parsed.data.sectionKey}`,
        `--topic=${parsed.data.topicSlug}`,
        `--per-difficulty=${parsed.data.perDifficulty}`,
        `--status=${parsed.data.status}`,
        "--delay-ms=0",
        "--json=1",
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          GEMINI_MODEL:
            process.env.GEMINI_GENERATION_MODEL ||
            process.env.GEMINI_MODEL ||
            "gemini-2.5-flash-lite",
        },
        timeout: 240000,
        maxBuffer: 1024 * 1024 * 4,
      }
    );

    return NextResponse.json({
      summary: extractJsonSummary(child.stdout),
      stdout: child.stdout,
      stderr: child.stderr,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
