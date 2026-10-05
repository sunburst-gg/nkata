// POST /presence: the editors heartbeat through the agent every 15 s. Same map and the same
// presence.changed fan-out as the WebSocket heartbeat. A viewer may be present: it is not a write
// to the project. See docs/engineering.md, Presence.
import { z } from "zod";
import { Ulid, type UserRef } from "@nkata/shared";
import type { Principal } from "../auth/tokens.js";
import { presence as presenceTable } from "../db/schema.js";
import { newId } from "../domain/ids.js";
import { loadProject, type TypedApp } from "./_shared.js";

const PresenceBody = z.object({ v: z.literal(1), project_id: Ulid, part_id: Ulid.nullable() });

export async function emitPresence(app: TypedApp, studioId: string, projectId: string, actorId: string): Promise<void> {
  await app.bus.emit({
    studio_id: studioId, target_kind: "project", target_id: projectId,
    message: { v: 1, kind: "presence.changed", project_id: projectId, actor_id: actorId, at: app.now().toISOString(), online: app.presence.list(projectId) },
  });
}

/** One heartbeat: the in-memory map, the presence row, and the fan-out when something changed. */
export async function heartbeat(app: TypedApp, principal: Principal, projectId: string, partId: string | null): Promise<void> {
  const now = app.now();
  const userRef: UserRef = { id: principal.user_id, name: principal.name, avatar_url: principal.avatar_url };
  const changed = app.presence.heartbeat(projectId, userRef, partId, now);
  await app.db
    .insert(presenceTable)
    .values({ id: newId(), studio_id: principal.studio_id, user_id: principal.user_id, project_id: projectId, part_id: partId, since: now, last_seen: now })
    .onConflictDoUpdate({ target: [presenceTable.user_id, presenceTable.project_id], set: { part_id: partId, last_seen: now, updated_at: now } });
  if (changed) await emitPresence(app, principal.studio_id, projectId, principal.user_id);
}

export async function presenceRoutes(app: TypedApp): Promise<void> {
  app.post("/presence", { schema: { body: PresenceBody } }, async (req) => {
    const proj = await loadProject(app.db, req.principal, req.body.project_id);
    await heartbeat(app, req.principal, proj.id, req.body.part_id);
    return { v: 1, online: app.presence.list(proj.id) };
  });

  app.get("/presence", { schema: { querystring: z.object({ project_id: Ulid }) } }, async (req) => {
    const proj = await loadProject(app.db, req.principal, req.query.project_id);
    return { v: 1, online: app.presence.list(proj.id) };
  });
}
