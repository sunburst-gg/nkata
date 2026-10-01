// Drops everything and migrates again. For tests and local dev only. Never run against production.
// Run: pnpm --filter @nkata/server db:reset
import { sql } from "drizzle-orm";
import { createDb, type Db } from "./client.js";
import { runMigrations } from "./migrate.js";

export async function resetSchema(db: Db): Promise<void> {
  await db.execute(sql`drop schema public cascade`);
  await db.execute(sql`create schema public`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await runMigrations(db);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set");
  const { db, pool } = createDb(url);
  await resetSchema(db);
  await pool.end();
  process.stdout.write("schema reset\n");
}
