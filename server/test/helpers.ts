// Integration test harness: a real Postgres and MinIO from the environment (scripts/testenv.sh),
// a fresh schema per test file, the seed, and signed-in clients per seed user.
import type { Db } from "../src/db/client.js";
import { buildApp, type App } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDb } from "../src/db/client.js";
import { resetSchema } from "../src/db/reset.js";
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
  /** Every email the fake mailer sent. */
  mailed: { to: string; subject: string; html: string; text: string }[];
  as(email: string): { headers: { authorization: string } };
  close(): Promise<void>;
};

export async function startHarness(): Promise<Harness> {
  const config = loadConfig({ ...process.env, NKATA_DEV: "1", LOG_LEVEL: "warn", S3_BUCKET: process.env["S3_BUCKET"] ?? "nkata-test", DISCORD_SECRET: "test-secret-sixteen-chars" });
  const { db, pool } = createDb(config.DATABASE_URL);
  await resetSchema(db);
  const store = createStore(config);
  await store.ensureBucket();
  const seeded = await seed(db);
  const mailed: { to: string; subject: string; html: string; text: string }[] = [];
  const app = await buildApp({ db, store, config, mailer: { configured: true, send: async (email) => { mailed.push(email); } } });
  await app.ready();

  const tokens: Record<string, string> = {};
  for (const email of Object.keys(seeded.users)) {
    const link = await app.inject({ method: "POST", url: "/auth/magic-link", payload: { email } });
    const token = new URL((link.json() as { link: string }).link).searchParams.get("token")!;
    const session = await app.inject({ method: "POST", url: "/auth/callback", payload: { token } });
    tokens[email] = (session.json() as { token: string }).token;
  }
  return {
    app, db, pool, seeded, tokens, mailed,
    as: (email) => ({ headers: { authorization: `Bearer ${tokens[email]!}` } }),
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
}
