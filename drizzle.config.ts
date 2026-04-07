import type { Config } from "drizzle-kit";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://aced_app:replace_me@127.0.0.1:54322/aced";

export default {
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
} satisfies Config;
