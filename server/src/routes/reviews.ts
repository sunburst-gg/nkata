// Score and Approve or Send back. Approve writes a review row, sets Approved, releases the lock,
// and re-evaluates every gate that names this part. Send back sets Draft.
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ReviewDecision, Ulid } from "@nkata/shared";
import { part, review, version } from "../db/schema.js";
import { notFound } from "../domain/errors.js";
import { newId } from "../domain/ids.js";
import { transition } from "../domain/state.js";
import { loadPart, requireRole, trainingOn, userRefs, type TypedApp } from "./_shared.js";
import { releaseLock } from "./locks.js";
import { openGates } from "./parts.js";

const ReviewBody = z.object({
  id: Ulid.optional(),
  part_id: Ulid,
  version_id: Ulid,
  score: z.number().int().min(1).max(5),
  decision: ReviewDecision,
  note: z.string().default(""),
});

export async function reviewRoutes(app: TypedApp): Promise<void> {
  app.post("/reviews", { schema: { body: ReviewBody } }, async (req, reply) => {
    requireRole(req.principal, ["art_director", "producer"], "reviewing");
    const { part: row, asset: a } = await loadPart(app.db, req.principal, req.body.part_id);
    const ver = (await app.db.select({ id: version.id }).from(version).where(and(eq(version.id, req.body.version_id), eq(version.part_id, row.id))).limit(1))[0];
    if (!ver) throw notFound("version", req.body.version_id);
    const id = req.body.id ?? newId();
    const existing = (await app.db.select().from(review).where(eq(review.id, id)).limit(1))[0];
    if (existing) return { v: 1, review: existing, state: row.state, opened: [] };

    const actor = { user_id: req.principal.user_id, roles: req.principal.roles };
    const to = transition(row.state, req.body.decision === "approve" ? "approve" : "send_back", actor, row.owner_id);
    const now = app.now();
    const [saved] = await app.db
      .insert(review)
      .values({ id, studio_id: a.studio_id, part_id: row.id, version_id: ver.id, reviewer_id: req.principal.user_id, score: req.body.score, decision: req.body.decision, note: req.body.note, capture_eligible: await trainingOn(app.db, a.studio_id), created_at: now, updated_at: now })
      .returning();
    await app.db.update(part).set({ state: to, updated_at: now }).where(eq(part.id, row.id));
    const base = { v: 1 as const, project_id: a.project_id, actor_id: req.principal.user_id, at: now.toISOString() };
    await app.bus.emit({
      studio_id: a.studio_id, target_kind: "review", target_id: id,
      message: { ...base, kind: "review.decided", part_id: row.id, version_id: ver.id, review_id: id, decision: req.body.decision, score: req.body.score, note: req.body.note },
    });
    await app.bus.emit({ studio_id: a.studio_id, target_kind: "part", target_id: row.id, message: { ...base, kind: "part.state", part_id: row.id, from: row.state, to } });
    let opened: string[] = [];
    if (req.body.decision === "approve") {
      await releaseLock(app, { studio_id: a.studio_id, project_id: a.project_id, part_id: row.id, actor_id: req.principal.user_id, reason: "approved", onlyHolder: null });
      opened = await openGates(app, a.studio_id, a.project_id, a.id, req.principal.user_id);
    }
    req.log.info({ project_id: a.project_id, part_id: row.id, decision: req.body.decision, opened }, "review decided");
    // The one Discord message. A failed post is logged and never fails the review.
    try {
      const owner = row.owner_id ? (await userRefs(app.db, [row.owner_id])).get(row.owner_id)?.name ?? null : null;
      const posted = await app.discord(a.project_id, { reviewer: req.principal.name, owner, asset: a.name, part: row.name, decision: req.body.decision, score: req.body.score, note: req.body.note });
      if (posted) req.log.info({ project_id: a.project_id, part_id: row.id }, "discord posted");
    } catch (err) {
      req.log.warn({ err, project_id: a.project_id, part_id: row.id }, "discord post failed");
    }
    return reply.status(201).send({ v: 1, review: saved, state: to, opened });
  });

  app.get("/reviews", { schema: { querystring: z.object({ part_id: Ulid }) } }, async (req) => {
    const { part: row } = await loadPart(app.db, req.principal, req.query.part_id);
    const rows = await app.db.select().from(review).where(eq(review.part_id, row.id)).orderBy(review.created_at);
    return { v: 1, reviews: rows };
  });
}
