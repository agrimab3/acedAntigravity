import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

let pool: Pool | undefined;
let dbInstance: NodePgDatabase<typeof schema> | undefined;

export function hasDatabaseConfig() {
  return Boolean(process.env.DATABASE_URL);
}

export function getDb() {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  if (!dbInstance) {
    dbInstance = drizzle(pool, { schema });
  }

  return dbInstance;
}
