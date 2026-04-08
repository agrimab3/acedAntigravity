import { Client } from "pg";
import { ACT_TAXONOMY_DATA } from "../lib/act-taxonomy-data.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for seeding.");
}

const client = new Client({
  connectionString: databaseUrl,
});

async function seed() {
  await client.connect();

  try {
    for (const [sectionIndex, section] of ACT_TAXONOMY_DATA.entries()) {
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

      for (const [topicIndex, topic] of section.topics.entries()) {
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
          [section.key, topic.slug, topic.name, topicIndex + 1]
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
