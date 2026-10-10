// WebSocket hub: wss://api.<domain>/ws?project=&token=. One socket per client per project.
// Client to server: presence.heartbeat, lock.request, lock.release. Server to client: ServerEvent.
// @fastify/websocket: https://github.com/fastify/fastify-websocket
import type { WebSocket } from "ws";
import { ClientMessage, type ServerEvent } from "@nkata/shared";
import { and, eq } from "drizzle-orm";
import { resolveSession, type Principal } from "./auth/tokens.js";
import { project } from "./db/schema.js";
import { AppError } from "./domain/errors.js";
import { loadPart, type TypedApp } from "./routes/_shared.js";
import { releaseLock } from "./routes/locks.js";
import { emitPresence as emitPresenceRoute, heartbeat } from "./routes/presence.js";

export const PRESENCE_SWEEP_MS = 15 * 1000;

type Client = { socket: WebSocket; principal: Principal; projectId: string };

export async function wsRoutes(app: TypedApp): Promise<void> {
  const clients = new Set<Client>();

  const send = (client: Client, message: ServerEvent): void => {
    if (client.socket.readyState === client.socket.OPEN) client.socket.send(JSON.stringify(message));
  };
  const broadcast = (projectId: string | null, message: ServerEvent): void => {
    for (const c of clients) if (projectId === null || c.projectId === projectId) send(c, message);
  };
  app.bus.subscribe(broadcast);

  const emitPresence = (studioId: string, projectId: string, actorId: string): Promise<void> => emitPresenceRoute(app, studioId, projectId, actorId);

  // Drop silent users every 15 s. Timer is unref'd so it never keeps a test process alive.
  const studioOf = new Map<string, { studio_id: string; last_actor: string }>();
  const sweeper = setInterval(() => {
    for (const projectId of app.presence.sweep(app.now())) {
      const info = studioOf.get(projectId);
      if (info) void emitPresence(info.studio_id, projectId, info.last_actor).catch((err) => app.log.error({ err, project_id: projectId }, "presence sweep failed"));
    }
  }, PRESENCE_SWEEP_MS);
  sweeper.unref();
  app.addHook("onClose", async () => clearInterval(sweeper));

  app.get("/ws", { websocket: true }, async (socket, req) => {
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token") ?? "";
    const projectId = url.searchParams.get("project") ?? "";
    let principal: Principal;
    try {
      principal = await resolveSession(app.db, token, app.now());
      const rows = await app.db.select({ id: project.id }).from(project).where(and(eq(project.id, projectId), eq(project.studio_id, principal.studio_id))).limit(1);
      if (!rows[0]) throw new AppError("not_found", "project not found");
    } catch (err) {
      req.log.info({ err }, "websocket rejected");
      socket.close(4001, err instanceof AppError ? err.code : "unauthorized");
      return;
    }
    const client: Client = { socket, principal, projectId };
    clients.add(client);
    studioOf.set(projectId, { studio_id: principal.studio_id, last_actor: principal.user_id });
    const log = req.log.child({ studio_id: principal.studio_id, project_id: projectId, user_id: principal.user_id });
    const userRef = { id: principal.user_id, name: principal.name, avatar_url: principal.avatar_url };

    socket.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
      void (async () => {
        const parsed = ClientMessage.safeParse(JSON.parse(String(raw)));
        if (!parsed.success) {
          log.info({ issues: parsed.error.issues }, "bad websocket message");
          return;
        }
        const msg = parsed.data;
        const now = app.now();
        if (msg.kind === "presence.heartbeat") {
          await heartbeat(app, principal, projectId, msg.part_id);
        } else if (msg.kind === "lock.release") {
          const { part: row, asset: a } = await loadPart(app.db, principal, msg.part_id);
          await releaseLock(app, { studio_id: a.studio_id, project_id: a.project_id, part_id: row.id, actor_id: principal.user_id, reason: "closed", onlyHolder: principal.user_id });
        } else if (msg.kind === "lock.request") {
          await app.inject({ method: "POST", url: `/parts/${msg.part_id}/lock/request`, headers: { authorization: `Bearer ${token}` } });
        }
      })().catch((err) => log.error({ err }, "websocket message failed"));
    });

    socket.on("close", () => {
      clients.delete(client);
      if (app.presence.leave(projectId, principal.user_id)) {
        void emitPresence(principal.studio_id, projectId, principal.user_id).catch((err) => log.error({ err }, "presence leave failed"));
      }
    });
  });
}
