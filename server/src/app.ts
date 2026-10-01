// Fastify 5 app factory. Routes live in src/routes/. The WebSocket hub in src/ws.ts.
// Fastify: https://fastify.dev/docs/latest/
// Zod type provider: https://github.com/turkerdev/fastify-type-provider-zod
import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { hasZodFastifySchemaValidationErrors, serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import { AppError } from "./domain/errors.js";
import { createEventBus, type EventBus } from "./events.js";
import { createPresence, type PresenceMap } from "./presence.js";
import type { Store } from "./store/s3.js";
import type { Principal } from "./auth/tokens.js";
import { resolveSession } from "./auth/tokens.js";
import { authRoutes } from "./routes/auth.js";
import { projectRoutes } from "./routes/projects.js";
import { assetRoutes } from "./routes/assets.js";
import { partRoutes } from "./routes/parts.js";
import { versionRoutes } from "./routes/versions.js";
import { lockRoutes } from "./routes/locks.js";
import { commentRoutes } from "./routes/comments.js";
import { reviewRoutes } from "./routes/reviews.js";
import { eventRoutes } from "./routes/events.js";
import { fileRoutes } from "./routes/files.js";
import { exportRoutes } from "./routes/export.js";
import { wsRoutes } from "./ws.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    store: Store;
    config: Config;
    bus: EventBus;
    presence: PresenceMap;
    now: () => Date;
  }
  interface FastifyRequest {
    principal: Principal;
  }
}

export type AppDeps = {
  db: Db;
  store: Store;
  config: Config;
  /** Clock. Tests inject a fake one. */
  now?: () => Date;
};

export type App = FastifyInstance;

// Routes that run without a session token.
const PUBLIC = new Set(["/health", "/auth/magic-link", "/auth/callback"]);

export async function buildApp(deps: AppDeps): Promise<App> {
  const app = Fastify({
    logger: {
      level: deps.config.LOG_LEVEL,
      base: { service: "nkata-server" },
      timestamp: () => `,"at":"${new Date().toISOString()}"`,
    },
    bodyLimit: 8 * 1024 * 1024,
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate("db", deps.db);
  app.decorate("store", deps.store);
  app.decorate("config", deps.config);
  app.decorate("bus", createEventBus(deps.db));
  app.decorate("presence", createPresence());
  app.decorate("now", deps.now ?? (() => new Date()));
  // Reference values are set per request in the onRequest hook. See https://fastify.dev/docs/latest/Reference/Decorators/
  app.decorateRequest("principal", null as unknown as Principal);

  await app.register(websocket);

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof AppError) {
      req.log.info({ code: err.code, details: err.details }, err.message);
      return reply.status(err.status).send({ v: 1, error: { code: err.code, message: err.message, ...err.details } });
    }
    if (hasZodFastifySchemaValidationErrors(err)) {
      const message = err.validation.map((v) => `${v.instancePath || "$"} ${v.message ?? ""}`.trim()).join("; ");
      return reply.status(400).send({ v: 1, error: { code: "bad_request", message } });
    }
    const status = (err as { statusCode?: unknown }).statusCode;
    if (typeof status === "number" && status < 500) {
      return reply.status(status).send({ v: 1, error: { code: "bad_request", message: err instanceof Error ? err.message : "request failed" } });
    }
    req.log.error({ err }, "unhandled error");
    return reply.status(500).send({ v: 1, error: { code: "internal", message: "internal error" } });
  });

  app.addHook("onRequest", async (req) => {
    const path = req.url.split("?")[0] ?? req.url;
    if (PUBLIC.has(path) || path === "/ws") return;
    const header = req.headers.authorization ?? "";
    if (!header.startsWith("Bearer ")) throw new AppError("unauthorized", "missing bearer token");
    req.principal = await resolveSession(app.db, header.slice("Bearer ".length), app.now());
    req.log = req.log.child({ studio_id: req.principal.studio_id, user_id: req.principal.user_id });
  });

  const typed = app.withTypeProvider<ZodTypeProvider>();
  typed.get("/health", async () => ({ v: 1, ok: true }));

  await typed.register(authRoutes);
  await typed.register(projectRoutes);
  await typed.register(assetRoutes);
  await typed.register(partRoutes);
  await typed.register(versionRoutes);
  await typed.register(lockRoutes);
  await typed.register(commentRoutes);
  await typed.register(reviewRoutes);
  await typed.register(eventRoutes);
  await typed.register(fileRoutes);
  await typed.register(exportRoutes);
  await typed.register(wsRoutes);

  return app;
}
