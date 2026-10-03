// Comment pins: point and normal in the part's local space at a version.
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { Ulid, Vec3, type CommentPin } from "@nkata/shared";
import { comment, version } from "../db/schema.js";
import { notFound } from "../domain/errors.js";
import { newId } from "../domain/ids.js";
import { IdParam, loadPart, userRefs, type TypedApp } from "./_shared.js";

const CommentBody = z.object({
  id: Ulid.optional(),
  part_id: Ulid,
  version_id: Ulid,
  point: Vec3,
  normal: Vec3,
  body: z.string().min(1),
});

export async function commentWire(app: TypedApp, rows: (typeof comment.$inferSelect)[]): Promise<CommentPin[]> {
  const authors = await userRefs(app.db, rows.map((r) => r.author_id));
  return rows.map((r) => ({
    id: r.id, part_id: r.part_id, version_id: r.version_id, author: authors.get(r.author_id)!,
    point: r.point, normal: r.normal, body: r.body,
    resolved_at: r.resolved_at ? r.resolved_at.toISOString() : null, created_at: r.created_at.toISOString(),
  }));
}

export async function commentRoutes(app: TypedApp): Promise<void> {
  app.get("/parts/:id/comments", { schema: { params: IdParam } }, async (req) => {
    const { part: row } = await loadPart(app.db, req.principal, req.params.id);
    const rows = await app.db.select().from(comment).where(eq(comment.part_id, row.id)).orderBy(comment.created_at);
    return { v: 1, comments: await commentWire(app, rows) };
  });

  app.post("/comments", { schema: { body: CommentBody } }, async (req, reply) => {
    const { part: row, asset: a } = await loadPart(app.db, req.principal, req.body.part_id);
    const ver = (await app.db.select({ id: version.id }).from(version).where(and(eq(version.id, req.body.version_id), eq(version.part_id, row.id))).limit(1))[0];
    if (!ver) throw notFound("version", req.body.version_id);
    const id = req.body.id ?? newId();
    const existing = (await app.db.select().from(comment).where(eq(comment.id, id)).limit(1))[0];
    if (existing) return { v: 1, comment: (await commentWire(app, [existing]))[0] };
    const now = app.now();
    const [saved] = await app.db
      .insert(comment)
      .values({ id, studio_id: a.studio_id, part_id: row.id, version_id: ver.id, author_id: req.principal.user_id, point: req.body.point, normal: req.body.normal, body: req.body.body, created_at: now, updated_at: now })
      .returning();
    const [pin] = await commentWire(app, [saved!]);
    await app.bus.emit({
      studio_id: a.studio_id, target_kind: "comment", target_id: id,
      message: { v: 1, kind: "comment.created", project_id: a.project_id, actor_id: req.principal.user_id, at: now.toISOString(), comment: pin! },
    });
    return reply.status(201).send({ v: 1, comment: pin });
  });

  app.post("/comments/:id/resolve", { schema: { params: IdParam } }, async (req) => {
    const existing = (await app.db.select().from(comment).where(and(eq(comment.id, req.params.id), eq(comment.studio_id, req.principal.studio_id))).limit(1))[0];
    if (!existing) throw notFound("comment", req.params.id);
    const now = app.now();
    const [saved] = await app.db.update(comment).set({ resolved_at: existing.resolved_at ?? now, updated_at: now }).where(eq(comment.id, existing.id)).returning();
    return { v: 1, comment: (await commentWire(app, [saved!]))[0] };
  });
}
