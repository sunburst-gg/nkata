// POST acquire, PUT heartbeat, DELETE release on /parts/:id/lock. Granted by the server only.
import { and, eq } from "drizzle-orm";
import { lock } from "../db/schema.js";
import { AppError } from "../domain/errors.js";
import { newId } from "../domain/ids.js";
import { decideGrant, expiryFrom } from "../domain/locks.js";
import { IdParam, isReviewer, loadPart, requireCanEdit, toLockInfo, userRef, type TypedApp } from "./_shared.js";

type ReleaseReason = "closed" | "published" | "expired" | "broken" | "handed_off" | "approved";

/** Deletes the lock row if present (and held by onlyHolder when given). Emits lock.released. */
export async function releaseLock(
  app: TypedApp,
  params: { studio_id: string; project_id: string; part_id: string; actor_id: string; reason: ReleaseReason; onlyHolder: string | null },
): Promise<boolean> {
  const where = params.onlyHolder ? and(eq(lock.part_id, params.part_id), eq(lock.holder_id, params.onlyHolder)) : eq(lock.part_id, params.part_id);
  const deleted = await app.db.delete(lock).where(where).returning({ id: lock.id });
  if (deleted.length === 0) return false;
  await app.bus.emit({
    studio_id: params.studio_id, target_kind: "part", target_id: params.part_id,
    message: { v: 1, kind: "lock.released", project_id: params.project_id, actor_id: params.actor_id, at: app.now().toISOString(), part_id: params.part_id, reason: params.reason },
  });
  return true;
}

export async function acquireLock(app: TypedApp, principal: import("../auth/tokens.js").Principal, partId: string) {
  const { part: row, asset: a } = await loadPart(app.db, principal, partId);
  if (row.state === "locked") throw new AppError("gate_closed", "this part waits on its gate", { part_id: row.id, after: row.gate.after });
  if (row.state === "approved" && !isReviewer(principal)) {
    throw new AppError("forbidden", "an approved part is read-only unless you are an art director or producer", { part_id: row.id });
  }
  requireCanEdit(principal, row);
  const now = app.now();
  const existing = (await app.db.select().from(lock).where(eq(lock.part_id, row.id)).limit(1))[0] ?? null;
  const decision = decideGrant(existing, principal.user_id, now);
  if (decision.kind === "held") {
    const info = toLockInfo(existing!, await userRef(app.db, existing!.holder_id), now);
    return { granted: false as const, lock: info, part: row, asset: a };
  }
  const values = { holder_id: principal.user_id, granted_at: now, heartbeat_at: now, expires_at: expiryFrom(now), updated_at: now };
  let saved;
  if (existing) {
    [saved] = await app.db.update(lock).set(decision.kind === "grant" ? values : { heartbeat_at: now, expires_at: expiryFrom(now), updated_at: now }).where(eq(lock.id, existing.id)).returning();
  } else {
    [saved] = await app.db.insert(lock).values({ id: newId(), studio_id: a.studio_id, part_id: row.id, ...values, created_at: now }).returning();
  }
  const info = toLockInfo(saved!, await userRef(app.db, principal.user_id), now);
  if (decision.kind === "grant") {
    await app.bus.emit({
      studio_id: a.studio_id, target_kind: "part", target_id: row.id,
      message: { v: 1, kind: "lock.granted", project_id: a.project_id, actor_id: principal.user_id, at: now.toISOString(), part_id: row.id, lock: info },
    });
  }
  return { granted: true as const, lock: info, part: row, asset: a };
}

export async function lockRoutes(app: TypedApp): Promise<void> {
  app.post("/parts/:id/lock", { schema: { params: IdParam } }, async (req, reply) => {
    const result = await acquireLock(app, req.principal, req.params.id);
    return reply.status(result.granted ? 200 : 409).send({ v: 1, granted: result.granted, lock: result.lock });
  });

  app.put("/parts/:id/lock", { schema: { params: IdParam } }, async (req) => {
    const { part: row } = await loadPart(app.db, req.principal, req.params.id);
    const now = app.now();
    const rows = await app.db
      .update(lock)
      .set({ heartbeat_at: now, expires_at: expiryFrom(now), updated_at: now })
      .where(and(eq(lock.part_id, row.id), eq(lock.holder_id, req.principal.user_id)))
      .returning();
    const saved = rows[0];
    if (!saved) throw new AppError("lock_held", "you do not hold this lock", { part_id: row.id });
    return { v: 1, lock: toLockInfo(saved, await userRef(app.db, req.principal.user_id), now) };
  });

  app.delete("/parts/:id/lock", { schema: { params: IdParam } }, async (req) => {
    const { part: row, asset: a } = await loadPart(app.db, req.principal, req.params.id);
    const released = await releaseLock(app, { studio_id: a.studio_id, project_id: a.project_id, part_id: row.id, actor_id: req.principal.user_id, reason: "closed", onlyHolder: req.principal.user_id });
    return { v: 1, released };
  });

  // Ask the holder to release. The holder's panel shows the name and a one-click release.
  app.post("/parts/:id/lock/request", { schema: { params: IdParam } }, async (req) => {
    const { part: row, asset: a } = await loadPart(app.db, req.principal, req.params.id);
    const now = app.now();
    const existing = (await app.db.select().from(lock).where(eq(lock.part_id, row.id)).limit(1))[0];
    if (!existing || existing.expires_at.getTime() <= now.getTime()) return { v: 1, requested: false };
    await app.bus.emit({
      studio_id: a.studio_id, target_kind: "part", target_id: row.id,
      message: {
        v: 1, kind: "lock.requested", project_id: a.project_id, actor_id: req.principal.user_id, at: now.toISOString(),
        part_id: row.id, requester: await userRef(app.db, req.principal.user_id), holder_id: existing.holder_id,
      },
    });
    return { v: 1, requested: true };
  });

}
