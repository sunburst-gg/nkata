// Forward-only migrations from server/drizzle/. Generated with drizzle-kit, never edited after shipping.
// https://orm.drizzle.team/docs/migrations
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { createDb, type Db } from "./client.js";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../../drizzle/", import.meta.url));

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set");
  const { db, pool } = createDb(url);
  await runMigrations(db);
  await pool.end();
  process.stdout.write("migrations applied\n");
}
