import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for seeding.");
}

const SECTIONS = [
  {
    key: "english",
    name: "English",
    color: "#5DCAA5",
    constellation: "Gemini",
    topics: [
      "Production of Writing",
      "Knowledge of Language",
      "Punctuation",
      "Grammar & Usage",
      "Sentence Structure",
    ],
  },
  {
    key: "math",
    name: "Math",
    color: "#AFA9EC",
    constellation: "Aquarius",
    topics: [
      "Number & Quantity",
      "Algebra",
      "Functions",
      "Geometry",
      "Statistics & Probability",
      "Integrating Essential Skills",
    ],
  },
  {
    key: "reading",
    name: "Reading",
    color: "#EF9F27",
    constellation: "Virgo",
    topics: ["Literary Narrative", "Social Science", "Humanities", "Natural Science"],
  },
  {
    key: "science",
    name: "Science",
    color: "#F0997B",
    constellation: "Sagittarius",
    topics: ["Data Representation", "Research Summaries", "Conflicting Viewpoints"],
  },
];

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const client = new Client({
  connectionString: databaseUrl,
});

async function seed() {
  await client.connect();

  try {
    for (const [sectionIndex, section] of SECTIONS.entries()) {
      await client.query(
        `
          INSERT INTO act_sections (key, name, color, constellation, display_order)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (key) DO UPDATE
          SET name = EXCLUDED.name,
              color = EXCLUDED.color,
              constellation = EXCLUDED.constellation,
              display_order = EXCLUDED.display_order
        `,
        [
          section.key,
          section.name,
          section.color,
          section.constellation,
          sectionIndex + 1,
        ]
      );

      for (const [topicIndex, topicName] of section.topics.entries()) {
        await client.query(
          `
            INSERT INTO act_topics (section_key, slug, name, display_order, is_active)
            VALUES ($1, $2, $3, $4, true)
            ON CONFLICT (section_key, slug) DO UPDATE
            SET name = EXCLUDED.name,
                display_order = EXCLUDED.display_order,
                is_active = EXCLUDED.is_active,
                updated_at = now()
          `,
          [section.key, slugify(topicName), topicName, topicIndex + 1]
        );
      }
    }

    const sectionCount = await client.query("SELECT COUNT(*)::int AS count FROM act_sections");
    const topicCount = await client.query("SELECT COUNT(*)::int AS count FROM act_topics");

    console.log(
      JSON.stringify(
        {
          seededSections: sectionCount.rows[0]?.count ?? 0,
          seededTopics: topicCount.rows[0]?.count ?? 0,
        },
        null,
        2
      )
    );
  } finally {
    await client.end();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
