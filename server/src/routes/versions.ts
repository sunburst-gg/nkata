// One version row per save. Publish marks it and sets Ready if the owner says so.
// Rollback creates a new version pointing at an old file_version. History is never deleted.
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { CheckResult, MirrorStatus, ObjectManifest, Ulid } from "@nkata/shared";
import { check_run, file_version, version } from "../db/schema.js";
import { AppError, notFound } from "../domain/errors.js";
import { newId } from "../domain/ids.js";
import { transition } from "../domain/state.js";
import { part } from "../db/schema.js";
import { IdParam, isReviewer, loadPart, requireCanEdit, type TypedApp } from "./_shared.js";
import { releaseLock } from "./locks.js";

const VersionBody = z.object({
  id: Ulid.optional(),
  file_version_id: Ulid.nullable().default(null),
  manifest: ObjectManifest.nullable().default(null),
  mirror_status: MirrorStatus.default("pending"),
  mirror_ms: z.number().int().min(0).nullable().default(null),
  note: z.string().default(""),
});

/** One level that places the mesh, from scan_refs.py. See docs/engineering.md, The mirror, Static. */
const LevelRef = z.object({ level: z.string().min(1), actors: z.number().int().min(0) });

const MirrorBody = z.object({
  mirror_status: MirrorStatus,
  mirror_ms: z.number().int().min(0).nullable().default(null),
  message: z.string().default(""),
  refs: z.array(LevelRef).nullable().default(null),
});

const PublishBody = z.object({
  version_id: Ulid,
  check_results: z.array(CheckResult).default([]),
  ready: z.boolean().default(false),
});

const RollbackBody = z.object({ id: Ulid.optional(), version_id: Ulid });

function versionWire(row: typeof version.$inferSelect) {
  return { ...row, created_at: row.created_at.toISOString(), updated_at: row.updated_at.toISOString() };
}

export async function versionRoutes(app: TypedApp): Promise<void> {
  app.get("/parts/:id/versions", { schema: { params: IdParam } }, async (req) => {
    const { part: row } = await loadPart(app.db, req.principal, req.params.id);
    const rows = await app.db.select().from(version).where(eq(version.part_id, row.id)).orderBy(desc(version.created_at), desc(version.id));
    return { v: 1, versions: rows.map(versionWire) };
  });

  app.post("/parts/:id/versions", { schema: { params: IdParam, body: VersionBody } }, async (req, reply) => {
    const { part: row, asset: a } = await loadPart(app.db, req.principal, req.params.id);
    requireCanEdit(req.principal, row);
    if (row.state === "locked") throw new AppError("gate_closed", "this part waits on its gate", { part_id: row.id });
    if (row.state === "approved" && !isReviewer(req.principal)) throw new AppError("forbidden", "an approved part is read-only", { part_id: row.id });
    const id = req.body.id ?? newId();
    const existing = (await app.db.select().from(version).where(eq(version.id, id)).limit(1))[0];
    if (existing) return { v: 1, version: versionWire(existing) };
    if (req.body.file_version_id) {
      const fv = (await app.db.select({ id: file_version.id }).from(file_version).where(and(eq(file_version.id, req.body.file_version_id), eq(file_version.studio_id, a.studio_id))).limit(1))[0];
      if (!fv) throw notFound("file_version", req.body.file_version_id);
    }
    const now = app.now();
    const [saved] = await app.db
      .insert(version)
      .values({ id, studio_id: a.studio_id, part_id: row.id, author_id: req.principal.user_id, file_version_id: req.body.file_version_id, manifest: req.body.manifest, mirror_status: req.body.mirror_status, mirror_ms: req.body.mirror_ms, note: req.body.note, created_at: now, updated_at: now })
      .returning();
    await app.bus.emit({
      studio_id: a.studio_id, target_kind: "version", target_id: id,
      message: { v: 1, kind: "version.created", project_id: a.project_id, actor_id: req.principal.user_id, at: now.toISOString(), part_id: row.id, version_id: id, published: false },
    });
    req.log.info({ project_id: a.project_id, part_id: row.id, version_id: id }, "version created");
    return reply.status(201).send({ v: 1, version: versionWire(saved!) });
  });

  // Mirror result from the agent. Both panels show it in one line.
  app.put("/parts/:id/versions/:vid/mirror", { schema: { params: z.object({ id: Ulid, vid: Ulid }), body: MirrorBody } }, async (req) => {
    const { part: row, asset: a } = await loadPart(app.db, req.principal, req.params.id);
    const now = app.now();
    const rows = await app.db
      .update(version)
      .set({ mirror_status: req.body.mirror_status, mirror_ms: req.body.mirror_ms, ...(req.body.refs === null ? {} : { refs: req.body.refs }), updated_at: now })
      .where(and(eq(version.id, req.params.vid), eq(version.part_id, row.id)))
      .returning();
    const saved = rows[0];
    if (!saved) throw notFound("version", req.params.vid);
    await app.bus.emit({
      studio_id: a.studio_id, target_kind: "version", target_id: saved.id,
      message: {
        v: 1, kind: "mirror.result", project_id: a.project_id, actor_id: req.principal.user_id, at: now.toISOString(),
        part_id: row.id, version_id: saved.id, status: req.body.mirror_status, mirror_ms: req.body.mirror_ms, message: req.body.message,
      },
    });
    return { v: 1, version: versionWire(saved) };
  });

  // Live check results before Publish, so the app shows them on the part as the artist works.
  app.post("/parts/:id/versions/:vid/checks", { schema: { params: z.object({ id: Ulid, vid: Ulid }), body: z.object({ results: z.array(CheckResult) }) } }, async (req) => {
    const { part: row, asset: a } = await loadPart(app.db, req.principal, req.params.id);
    requireCanEdit(req.principal, row);
    const ver = (await app.db.select().from(version).where(and(eq(version.id, req.params.vid), eq(version.part_id, row.id))).limit(1))[0];
    if (!ver) throw notFound("version", req.params.vid);
    const now = app.now();
    if (req.body.results.length > 0) {
      await app.db.insert(check_run).values(
        req.body.results.map((c) => ({ id: newId(), studio_id: a.studio_id, version_id: ver.id, check_id: c.check_id, severity: c.severity, passed: c.passed, auto_fixed: c.auto_fixed, message: c.message, created_at: now, updated_at: now })),
      );
    }
    return { v: 1, version_id: ver.id, recorded: req.body.results.length };
  });

  app.get("/parts/:id/versions/:vid/checks", { schema: { params: z.object({ id: Ulid, vid: Ulid }) } }, async (req) => {
    const { part: row } = await loadPart(app.db, req.principal, req.params.id);
    const ver = (await app.db.select({ id: version.id }).from(version).where(and(eq(version.id, req.params.vid), eq(version.part_id, row.id))).limit(1))[0];
    if (!ver) throw notFound("version", req.params.vid);
    const rows = await app.db.select().from(check_run).where(eq(check_run.version_id, ver.id)).orderBy(check_run.created_at);
    // The newest run per check wins.
    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) latest.set(r.check_id, r);
    return { v: 1, version_id: ver.id, results: [...latest.values()].map((r) => ({ check_id: r.check_id, severity: r.severity, passed: r.passed, auto_fixed: r.auto_fixed, message: r.message })) };
  });

  // Publish: record check results, block on a failed blocking check, mark published, release the lock, set Ready if asked.
  app.post("/parts/:id/publish", { schema: { params: IdParam, body: PublishBody } }, async (req) => {
    const { part: row, asset: a } = await loadPart(app.db, req.principal, req.params.id);
    requireCanEdit(req.principal, row);
    const ver = (await app.db.select().from(version).where(and(eq(version.id, req.body.version_id), eq(version.part_id, row.id))).limit(1))[0];
    if (!ver) throw notFound("version", req.body.version_id);
    const now = app.now();
    if (req.body.check_results.length > 0) {
      await app.db.insert(check_run).values(
        req.body.check_results.map((c) => ({ id: newId(), studio_id: a.studio_id, version_id: ver.id, check_id: c.check_id, severity: c.severity, passed: c.passed, auto_fixed: c.auto_fixed, message: c.message, created_at: now, updated_at: now })),
      );
    }
    const blocked_by = req.body.check_results.filter((c) => !c.passed && c.severity === "block");
    if (blocked_by.length > 0) {
      return { v: 1, published: false, version_id: ver.id, state: row.state, blocked_by };
    }
    await app.db.update(version).set({ published: true, updated_at: now }).where(eq(version.id, ver.id));
    await app.bus.emit({
      studio_id: a.studio_id, target_kind: "version", target_id: ver.id,
      message: { v: 1, kind: "version.created", project_id: a.project_id, actor_id: req.principal.user_id, at: now.toISOString(), part_id: row.id, version_id: ver.id, published: true },
    });
    let state = row.state;
    if (req.body.ready && row.state === "draft") {
      state = transition(row.state, "mark_ready", { user_id: req.principal.user_id, roles: req.principal.roles }, row.owner_id);
      await app.db.update(part).set({ state, updated_at: now }).where(eq(part.id, row.id));
      await app.bus.emit({
        studio_id: a.studio_id, target_kind: "part", target_id: row.id,
        message: { v: 1, kind: "part.state", project_id: a.project_id, actor_id: req.principal.user_id, at: now.toISOString(), part_id: row.id, from: row.state, to: state },
      });
    }
    await releaseLock(app, { studio_id: a.studio_id, project_id: a.project_id, part_id: row.id, actor_id: req.principal.user_id, reason: "published", onlyHolder: req.principal.user_id });
    return { v: 1, published: true, version_id: ver.id, state, blocked_by: [] };
  });

  // Roll back: a new version that points at an older file_version. One click, nothing deleted.
  app.post("/parts/:id/rollback", { schema: { params: IdParam, body: RollbackBody } }, async (req, reply) => {
    const { part: row, asset: a } = await loadPart(app.db, req.principal, req.params.id);
    requireCanEdit(req.principal, row);
    const target = (await app.db.select().from(version).where(and(eq(version.id, req.body.version_id), eq(version.part_id, row.id))).limit(1))[0];
    if (!target) throw notFound("version", req.body.version_id);
    const id = req.body.id ?? newId();
    const existing = (await app.db.select().from(version).where(eq(version.id, id)).limit(1))[0];
    if (existing) return { v: 1, version: versionWire(existing) };
    const now = app.now();
    const [saved] = await app.db
      .insert(version)
      .values({ id, studio_id: a.studio_id, part_id: row.id, author_id: req.principal.user_id, file_version_id: target.file_version_id, manifest: target.manifest, mirror_status: "pending", note: `Rolled back to ${target.id}`, created_at: now, updated_at: now })
      .returning();
    await app.bus.emit({
      studio_id: a.studio_id, target_kind: "version", target_id: id,
      message: { v: 1, kind: "version.created", project_id: a.project_id, actor_id: req.principal.user_id, at: now.toISOString(), part_id: row.id, version_id: id, published: false },
    });
    return reply.status(201).send({ v: 1, version: versionWire(saved!) });
  });
}
