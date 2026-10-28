// The API docs: on in dev mode at /docs, built from the routes' own schemas; absent otherwise.
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDb } from "../src/db/client.js";
import { createStore } from "../src/store/s3.js";
import { hasInfra } from "./helpers.js";

async function appWith(dev: boolean) {
  const config = loadConfig({ ...process.env, NKATA_DEV: dev ? "1" : "", LOG_LEVEL: "warn" });
  const { db, pool } = createDb(config.DATABASE_URL);
  const app = await buildApp({ db, store: createStore(config), config, mailer: { configured: true, send: async () => {} } });
  await app.ready();
  return { app, close: async () => { await app.close(); await pool.end(); } };
}

describe.skipIf(!hasInfra)("api docs", () => {
  it("describes the routes from their schemas in dev mode, with no token", async () => {
    const { app, close } = await appWith(true);
    try {
      const page = await app.inject({ method: "GET", url: "/docs" });
      expect(page.statusCode).toBeLessThan(400);
      const res = await app.inject({ method: "GET", url: "/docs/json" });
      expect(res.statusCode).toBe(200);
      const spec = res.json() as { openapi: string; paths: Record<string, Record<string, { requestBody?: unknown }>> };
      expect(spec.openapi.startsWith("3.")).toBe(true);
      // A route with a Zod body shows that body, so the docs come from the validator.
      expect(spec.paths["/files/download-urls"]?.["post"]?.requestBody).toBeTruthy();
      expect(spec.paths["/parts/{id}/exceptions"]?.["post"]).toBeTruthy();
    } finally {
      await close();
    }
  });

  it("is not there outside dev mode", async () => {
    const { app, close } = await appWith(false);
    try {
      // Without the plugin the path is an ordinary private route, and nothing answers it.
      expect((await app.inject({ method: "GET", url: "/docs/json" })).statusCode).toBe(401);
      expect(app.printRoutes()).not.toContain("docs");
    } finally {
      await close();
    }
  });
});
