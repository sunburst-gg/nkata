// Server entry. Reads the environment, migrates, ensures the bucket, listens.
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { createStore } from "./store/s3.js";

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
await runMigrations(db);
const store = createStore(config);
await store.ensureBucket();
const app = await buildApp({ db, store, config });

const shutdown = async (): Promise<void> => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

await app.listen({ port: config.PORT, host: config.HOST });
