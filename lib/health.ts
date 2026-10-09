export type HealthDb = { execute: (query: unknown) => Promise<unknown> };

export async function checkAppHealth(db: HealthDb | null) {
  if (!db) return false;
  try {
    await db.execute("select 1" as never);
    return true;
  } catch {
    return false;
  }
}
