// Integration test harness: a real Postgres and MinIO from the environment (scripts/testenv.sh),
// a fresh schema per test file, the seed, and signed-in clients per seed user.
import { sql } from "drizzle-orm";
import type { Db } from "../src/db/client.js";
import { buildApp, type App } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { createStore } from "../src/store/s3.js";
import { seed, type Seeded } from "../src/seed.js";
import type pg from "pg";

export const hasInfra = Boolean(process.env["DATABASE_URL"] && process.env["S3_ENDPOINT"]);

export type Harness = {
  app: App;
  db: Db;
  pool: pg.Pool;
  seeded: Seeded;
  tokens: Record<string, string>;
  as(email: string): { headers: { authorization: string } };
  close(): Promise<void>;
};

export async function resetSchema(db: Db): Promise<void> {
  await db.execute(sql`drop schema public cascade`);
  await db.execute(sql`create schema public`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
}

export async function startHarness(): Promise<Harness> {
  const config = loadConfig({ ...process.env, NKATA_DEV: "1", LOG_LEVEL: "warn", S3_BUCKET: process.env["S3_BUCKET"] ?? "nkata-test" });
  const { db, pool } = createDb(config.DATABASE_URL);
  await resetSchema(db);
  await runMigrations(db);
  const store = createStore(config);
  await store.ensureBucket();
  const seeded = await seed(db);
  const app = await buildApp({ db, store, config });
  await app.ready();

  const tokens: Record<string, string> = {};
  for (const email of Object.keys(seeded.users)) {
    const link = await app.inject({ method: "POST", url: "/auth/magic-link", payload: { email } });
    const token = new URL((link.json() as { link: string }).link).searchParams.get("token")!;
    const session = await app.inject({ method: "POST", url: "/auth/callback", payload: { token } });
    tokens[email] = (session.json() as { token: string }).token;
  }
  return {
    app, db, pool, seeded, tokens,
    as: (email) => ({ headers: { authorization: `Bearer ${tokens[email]!}` } }),
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
}
