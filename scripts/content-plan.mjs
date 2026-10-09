import pg from "pg";
import {
  CONTENT_DIFFICULTIES,
  CONTENT_SCOPES,
  getCellTarget,
  getSectionTarget,
} from "../lib/content-inventory-targets.mjs";

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

const requestedScopes = (args.scope || CONTENT_SCOPES.join(","))
  .split(",")
  .map((value) => value.trim())
  .filter((value) => CONTENT_SCOPES.includes(value));

const jsonMode = args.json === "1" || args.json === "true";
const top = Math.max(1, Number(args.top || 30));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function key(scope, topicId, difficulty) {
  return `${scope}::${topicId}::${difficulty}`;
}

function pad(value, length) {
  const text = String(value);
  return text.length >= length ? text : text + " ".repeat(length - text.length);
}

try {
  const [topicsResult, countsResult, reserveExposureResult] = await Promise.all([
    pool.query(`
      select id, section_key, slug, name, display_order
      from act_topics
      where is_active = true
      order by section_key, display_order
    `),
    pool.query(`
      select
        q.usage_scope,
        q.topic_id,
        q.difficulty,
        count(*) filter (where q.status = 'published')::int as published_count,
        count(*) filter (where q.status = 'draft')::int as draft_count,
        count(*) filter (where q.status = 'rejected')::int as rejected_count
      from questions q
      inner join act_topics t on t.id = q.topic_id
      where t.is_active = true
        and q.usage_scope = any($1::text[])
      group by q.usage_scope, q.topic_id, q.difficulty
    `, [requestedScopes]),
    pool.query(`
      select count(distinct q.id)::int as exposed_reserve_questions
      from questions q
      inner join question_exposures qe on qe.question_id = q.id
      where q.usage_scope = 'mock_reserve'
    `),
  ]);

  const topics = topicsResult.rows;
  const topicCountBySection = new Map();
  for (const topic of topics) {
    topicCountBySection.set(
      topic.section_key,
      (topicCountBySection.get(topic.section_key) ?? 0) + 1
    );
  }

  const counts = new Map();
  for (const row of countsResult.rows) {
    counts.set(key(row.usage_scope, row.topic_id, row.difficulty), {
      published: Number(row.published_count),
      draft: Number(row.draft_count),
      rejected: Number(row.rejected_count),
    });
  }

  const rows = [];
  for (const scope of requestedScopes) {
    for (const topic of topics) {
      const activeTopicCount = topicCountBySection.get(topic.section_key) ?? 0;
      for (const difficulty of CONTENT_DIFFICULTIES) {
        const current = counts.get(key(scope, topic.id, difficulty)) ?? {
          published: 0,
          draft: 0,
          rejected: 0,
        };
        const target = getCellTarget({
          scope,
          sectionKey: topic.section_key,
          activeTopicCount,
        });
        const pipelineCount = current.published + current.draft;
        rows.push({
          scope,
          sectionKey: topic.section_key,
          topicSlug: topic.slug,
          topicName: topic.name,
          difficulty,
          target,
          published: current.published,
          draft: current.draft,
          rejected: current.rejected,
          pipelineCount,
          approvalGap: Math.max(0, target - current.published),
          generationGap: Math.max(0, target - pipelineCount),
        });
      }
    }
  }

  rows.sort((left, right) => {
    if (right.generationGap !== left.generationGap) return right.generationGap - left.generationGap;
    if (right.approvalGap !== left.approvalGap) return right.approvalGap - left.approvalGap;
    if (left.scope !== right.scope) return left.scope.localeCompare(right.scope);
    if (left.sectionKey !== right.sectionKey) return left.sectionKey.localeCompare(right.sectionKey);
    if (left.topicName !== right.topicName) return left.topicName.localeCompare(right.topicName);
    return left.difficulty.localeCompare(right.difficulty);
  });

  const summaries = requestedScopes.flatMap((scope) =>
    ["english", "math", "reading", "science"].map((sectionKey) => {
      const sectionRows = rows.filter(
        (row) => row.scope === scope && row.sectionKey === sectionKey
      );
      return {
        scope,
        sectionKey,
        sectionTarget: getSectionTarget(scope, sectionKey),
        effectiveCellTargetTotal: sectionRows.reduce((sum, row) => sum + row.target, 0),
        published: sectionRows.reduce((sum, row) => sum + row.published, 0),
        drafts: sectionRows.reduce((sum, row) => sum + row.draft, 0),
        approvalGap: sectionRows.reduce((sum, row) => sum + row.approvalGap, 0),
        generationGap: sectionRows.reduce((sum, row) => sum + row.generationGap, 0),
      };
    })
  );

  const result = {
    generatedAt: new Date().toISOString(),
    scopes: requestedScopes,
    reserveExposureViolations: Number(
      reserveExposureResult.rows[0]?.exposed_reserve_questions ?? 0
    ),
    summaries,
    priorities: rows.filter((row) => row.approvalGap > 0),
  };

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("\nACED content inventory plan\n");
    console.log("Targets: practice = existing section targets; mock_reserve = ~3 fresh forms.");
    console.log(
      `Mock-reserve exposure violations: ${result.reserveExposureViolations} (must stay 0)\n`
    );

    for (const scope of requestedScopes) {
      console.log(scope.toUpperCase());
      const scopeSummaries = summaries.filter((summary) => summary.scope === scope);
      for (const summary of scopeSummaries) {
        console.log(
          `  ${pad(summary.sectionKey, 8)} published ${String(summary.published).padStart(3)} | drafts ${String(summary.drafts).padStart(3)} | generation gap ${String(summary.generationGap).padStart(3)} | approval gap ${String(summary.approvalGap).padStart(3)}`
        );
      }
      console.log("");
    }

    const priorities = result.priorities.slice(0, top);
    console.log(`Top ${priorities.length} inventory gaps:\n`);
    for (const row of priorities) {
      console.log(
        `${pad(row.scope, 12)} ${pad(row.sectionKey, 8)} ${pad(row.difficulty, 6)} ${pad(row.topicName, 34)} target ${String(row.target).padStart(2)} | pub ${String(row.published).padStart(2)} | draft ${String(row.draft).padStart(2)} | gen gap ${String(row.generationGap).padStart(2)} | approval gap ${String(row.approvalGap).padStart(2)}`
      );
    }

    console.log("\nGeneration gap = how many more candidates the pipeline actually needs.");
    console.log("Approval gap = how many more published/approved questions are still needed.");
  }
} finally {
  await pool.end();
}
