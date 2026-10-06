// Parts: list, detail, assign owner, state actions, remove gate.
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { Ulid } from "@nkata/shared";
import { asset, part } from "../db/schema.js";
import { AppError } from "../domain/errors.js";
import { evaluateGates } from "../domain/gates.js";
import { transition, type StateAction } from "../domain/state.js";
import { assetState, currentLock, IdParam, loadAsset, loadPart, loadProject, partContext, partWire, requireRole, userRefs, type PartContext, type TypedApp } from "./_shared.js";
import { releaseLock } from "./locks.js";

const PartsQuery = z.object({ asset_id: Ulid.optional(), project_id: Ulid.optional(), file: z.string().optional() });

/** Applies gate openings for one asset: Locked to Draft plus gate.opened and part.state events. */
export async function openGates(app: TypedApp, studioId: string, projectId: string, assetId: string, actorId: string): Promise<string[]> {
  const parts = await app.db.select().from(part).where(eq(part.asset_id, assetId));
  const openings = evaluateGates(parts);
  const now = app.now();
  for (const o of openings) {
    await app.db.update(part).set({ state: "draft", updated_at: now }).where(and(eq(part.id, o.part_id), eq(part.state, "locked")));
    const base = { v: 1 as const, project_id: projectId, actor_id: actorId, at: now.toISOString() };
    await app.bus.emit({ studio_id: studioId, target_kind: "part", target_id: o.part_id, message: { ...base, kind: "part.state", part_id: o.part_id, from: "locked", to: "draft" } });
    await app.bus.emit({ studio_id: studioId, target_kind: "part", target_id: o.part_id, message: { ...base, kind: "gate.opened", part_id: o.part_id, opened_by: o.opened_by } });
  }
  return openings.map((o) => o.part_id);
}

export async function partRoutes(app: TypedApp): Promise<void> {
  app.get("/parts", { schema: { querystring: PartsQuery } }, async (req) => {
    const p = req.principal;
    let rows;
    if (req.query.asset_id) {
      const a = await loadAsset(app.db, p, req.query.asset_id);
      rows = await app.db.select({ part }).from(part).innerJoin(asset, eq(asset.id, part.asset_id)).where(eq(part.asset_id, a.id)).orderBy(part.position);
    } else if (req.query.project_id) {
      const proj = await loadProject(app.db, p, req.query.project_id);
      const conditions = [eq(asset.project_id, proj.id)];
      // Parts mapped to this open file: blend_collection.file or file.path equals the query.
      if (req.query.file !== undefined) {
        conditions.push(sql`(${part.mapping}->>'file' = ${req.query.file} or ${part.mapping}->>'path' = ${req.query.file})`);
      }
      rows = await app.db.select({ part }).from(part).innerJoin(asset, eq(asset.id, part.asset_id)).where(and(...conditions)).orderBy(asset.name, part.position);
    } else {
      throw new AppError("bad_request", "asset_id or project_id is required");
    }
    const owners = await userRefs(app.db, rows.map((r) => r.part.owner_id).filter((x): x is string => x !== null));
    const now = app.now();
    const contexts = new Map<string, PartContext>();
    for (const r of rows) if (!contexts.has(r.part.asset_id)) contexts.set(r.part.asset_id, await partContext(app.db, await loadAsset(app.db, p, r.part.asset_id)));
    const parts = [];
    for (const r of rows) parts.push(partWire(r.part, contexts.get(r.part.asset_id)!, r.part.owner_id ? owners.get(r.part.owner_id) ?? null : null, await currentLock(app.db, r.part.id, now)));
    return { v: 1, parts };
  });

  app.get("/parts/:id", { schema: { params: IdParam } }, async (req) => {
    const { part: row, asset: a } = await loadPart(app.db, req.principal, req.params.id);
    const owners = await userRefs(app.db, row.owner_id ? [row.owner_id] : []);
    const ctx = await partContext(app.db, a);
    return {
      v: 1,
      part: partWire(row, ctx, row.owner_id ? owners.get(row.owner_id) ?? null : null, await currentLock(app.db, row.id, app.now())),
      asset_state: assetState(ctx.siblings.map((s) => s.state)),
    };
  });

  app.patch("/parts/:id", { schema: { params: IdParam, body: z.object({ owner_id: Ulid.nullable() }) } }, async (req) => {
    requireRole(req.principal, ["art_director", "producer"], "assigning an owner");
    const { part: row, asset: a } = await loadPart(app.db, req.principal, req.params.id);
    const now = app.now();
    const [updated] = await app.db.update(part).set({ owner_id: req.body.owner_id, updated_at: now }).where(eq(part.id, row.id)).returning();
    await app.bus.audit({
      studio_id: a.studio_id, project_id: a.project_id, actor_id: req.principal.user_id,
      kind: "audit.owner_assigned", target_kind: "part", target_id: row.id, payload: { owner_id: req.body.owner_id },
    });
    return { v: 1, part: partWire(updated!, await partContext(app.db, a), null, await currentLock(app.db, row.id, now)) };
  });

  // Mark Ready, Send back, Reopen. Approve goes through POST /reviews.
  app.post("/parts/:id/state", { schema: { params: IdParam, body: z.object({ action: z.enum(["mark_ready", "send_back", "reopen"]) }) } }, async (req) => {
    const { part: row, asset: a } = await loadPart(app.db, req.principal, req.params.id);
    const action: StateAction = req.body.action;
    const to = transition(row.state, action, { user_id: req.principal.user_id, roles: req.principal.roles }, row.owner_id);
    const now = app.now();
    await app.db.update(part).set({ state: to, updated_at: now }).where(eq(part.id, row.id));
    await app.bus.emit({
      studio_id: a.studio_id, target_kind: "part", target_id: row.id,
      message: { v: 1, kind: "part.state", project_id: a.project_id, actor_id: req.principal.user_id, at: now.toISOString(), part_id: row.id, from: row.state, to },
    });
    return { v: 1, part_id: row.id, from: row.state, to };
  });

  // Removing a gate sets after: [] on that asset only and writes an event. The part opens at once.
  app.post("/parts/:id/gate/remove", { schema: { params: IdParam } }, async (req) => {
    requireRole(req.principal, ["art_director", "producer"], "removing a gate");
    const { part: row, asset: a } = await loadPart(app.db, req.principal, req.params.id);
    const now = app.now();
    await app.db.update(part).set({ gate: { after: [] }, updated_at: now }).where(eq(part.id, row.id));
    await app.bus.audit({
      studio_id: a.studio_id, project_id: a.project_id, actor_id: req.principal.user_id,
      kind: "audit.gate_removed", target_kind: "part", target_id: row.id, payload: { was: row.gate },
    });
    const opened = await openGates(app, a.studio_id, a.project_id, a.id, req.principal.user_id);
    return { v: 1, part_id: row.id, opened };
  });

  // A producer can break a lock, logged. See docs/engineering.md, Lock grant.
  app.post("/parts/:id/lock/break", { schema: { params: IdParam } }, async (req) => {
    requireRole(req.principal, ["producer"], "breaking a lock");
    const { part: row, asset: a } = await loadPart(app.db, req.principal, req.params.id);
    const released = await releaseLock(app, { studio_id: a.studio_id, project_id: a.project_id, part_id: row.id, actor_id: req.principal.user_id, reason: "broken", onlyHolder: null });
    await app.bus.audit({
      studio_id: a.studio_id, project_id: a.project_id, actor_id: req.principal.user_id,
      kind: "audit.lock_broken", target_kind: "part", target_id: row.id, payload: { released },
    });
    return { v: 1, released };
  });
}
