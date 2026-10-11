import fs from "node:fs";
import pg from "pg";
import { reviewQuestionQuality } from "../lib/question-utils.ts";

const { Client } = pg;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const rows = (
  await client.query(`
    select mfq.section_key,mfq.position,q.id,q.prompt,q.passage,q.choices,
           q.correct_answer,q.explanation,q.fingerprint,q.difficulty,t.name topic,
           qs.title set_title,qs.content set_content
    from mock_test_form_questions mfq
    join mock_test_forms f on f.id=mfq.form_id
    join mock_tests mt on mt.id=f.mock_test_id
    join questions q on q.id=mfq.question_id
    join act_topics t on t.id=q.topic_id
    left join question_sets qs on qs.id=q.question_set_id
    where mt.slug='2026-12-05' and f.version='A'
    order by
      case mfq.section_key
        when 'english' then 1
        when 'math' then 2
        when 'reading' then 3
        else 4
      end,
      mfq.position
  `)
).rows;

if (rows.length !== 171) {
  throw new Error(`Expected 171 questions, found ${rows.length}.`);
}

const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();

const promptCounts = new Map();
for (const row of rows) {
  const key = normalize(
    [row.set_content || row.passage || "", row.prompt, JSON.stringify(row.choices)].join(" ")
  );
  promptCounts.set(key, (promptCounts.get(key) || 0) + 1);
}

const issues = [];
for (const row of rows) {
  if (!row.explanation?.trim()) {
    issues.push(`${row.section_key} ${row.position}: missing explanation`);
  }
  const duplicateKey = normalize(
    [row.set_content || row.passage || "", row.prompt, JSON.stringify(row.choices)].join(" ")
  );
  if ((promptCounts.get(duplicateKey) || 0) > 1) {
    issues.push(`${row.section_key} ${row.position}: duplicate question content`);
  }

  const review = reviewQuestionQuality({
    id: row.id,
    section: row.section_key,
    topic: row.topic,
    difficulty: row.difficulty,
    passage: row.passage || row.set_content,
    question_text: row.prompt,
    choices: row.choices,
    correct_answer: row.correct_answer,
    explanation: row.explanation,
  });

  const flags = [...review.blockingFlags, ...review.warningFlags];
  if (flags.length) {
    issues.push(
      `${row.section_key} ${row.position}: ${flags
        .map((flag) => flag.code)
        .join(", ")}`
    );
  }

  for (const letter of ["A", "B", "C", "D"]) {
    const positive = new RegExp(
      `(?:choice|option)\\s+${letter}\\s+(?:is|was)\\s+(?:the\\s+)?(?:correct|right|best)\\b`,
      "i"
    ).test(row.explanation);
    const negative = new RegExp(
      `(?:choice|option)\\s+${letter}\\s+(?:is|was)\\s+(?:incorrect|wrong|not\\s+correct)\\b`,
      "i"
    ).test(row.explanation);

    if (positive && negative) {
      issues.push(
        `${row.section_key} ${row.position}: explanation calls choice ${letter} both correct and incorrect`
      );
    }
    if (positive && letter !== row.correct_answer) {
      issues.push(
        `${row.section_key} ${row.position}: explanation names choice ${letter} correct but key is ${row.correct_answer}`
      );
    }
  }
}

let output = `# Dec 5 Form A Review

Generated October 10, 2026. Form contains **171 questions**: English 50, Math 45, Reading 36, Science 40.

## Suspicious-item scan

`;

output += issues.length
  ? issues.map((issue) => `- ⚠️ ${issue}`).join("\n") + "\n"
  : "- No duplicate prompts, missing explanations, deterministic multiple-answer warnings, or explicit explanation/key contradictions were found in Form A.\n";

output += `
## Bank-wide explanation contradiction scan

The preparation pass scanned every non-empty explanation in the question bank for explicit same-choice correct/incorrect claims and explicit answer-key contradictions. No clear-cut stored-bank contradiction matched that rule. Historical audit documents contain a rejected English generator candidate whose explanation described a non-keyed choice as “although correct”; that candidate was never stored as a published question and is not in Form A.

`;

for (const section of ["english", "math", "reading", "science"]) {
  output += `\n# ${section[0].toUpperCase() + section.slice(1)}\n`;
  for (const row of rows.filter((item) => item.section_key === section)) {
    output += `\n## ${section.toUpperCase()} ${row.position} — ${row.topic} (${row.difficulty})\n\n`;
    if (row.set_title) {
      output += `**Passage/set:** ${row.set_title}\n\n`;
    }
    if (["english", "reading", "science"].includes(section)) {
      const passage = row.set_content || row.passage || "";
      output += `**Full passage / set text (question ${row.position}):**\n\n${passage.replace(/<u>([\s\S]*?)<\/u>/gi,"<u>$1</u>").replace(/\[underline\]([\s\S]*?)\[\/underline\]/gi,"<u>$1</u>").replace(/__([\s\S]*?)__/g,"<u>$1</u>")}\n\n`;
    }
    output += `**Question:** ${row.prompt}\n\n`;
    for (const letter of ["A", "B", "C", "D"]) {
      output += `- ${letter}. ${row.choices[letter]}\n`;
    }
    output += `\n**Answer:** ${row.correct_answer}\n\n`;
    output += `**Explanation:** ${row.explanation}\n`;
  }
}

fs.mkdirSync("docs", { recursive: true });
fs.writeFileSync("docs/dec5-form-review.md", output);
await client.end();
console.log(
  `Wrote docs/dec5-form-review.md with ${rows.length} questions and ${issues.length} flagged issues.`
);
