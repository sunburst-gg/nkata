// One version row per save. Publish marks it and sets Ready if the owner says so.
// Rollback creates a new version pointing at an old file_version. History is never deleted:
// there is no delete route and no delete statement in this file. capture_eligible is stamped
// from studio.training at insert and never updated. The render is the viewport capture taken
// on Mark Ready, kept in the store under the version (docs/decisions.md, 2026-10-10).
import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";
import { CheckResult, MirrorStatus, ObjectManifest, Timestamp, Ulid } from "@nkata/shared";
import { check_run, file_version, version } from "../db/schema.js";
import { AppError, notFound } from "../domain/errors.js";
import { newId } from "../domain/ids.js";
import { transition } from "../domain/state.js";
import { part } from "../db/schema.js";
import { IdParam, isReviewer, loadPart, requireCanEdit, requireNotHeldByOther, trainingOn, type TypedApp } from "./_shared.js";
import { releaseLock } from "./locks.js";

const VersionBody = z.object({
  id: Ulid.optional(),
  file_version_id: Ulid.nullable().default(null),
  manifest: ObjectManifest.nullable().default(null),
  mirror_status: MirrorStatus.default("pending"),
  mirror_ms: z.number().int().min(0).nullable().default(null),
  note: z.string().default(""),
  /** From the editor's clock: when the file was opened and when this save happened. */
  opened_at: Timestamp.nullable().default(null),
  saved_at: Timestamp.nullable().default(null),
});

const VersionParams = z.object({ id: Ulid, vid: Ulid });
const RenderUrlBody = z.object({ size: z.number().int().min(1).max(50 * 1024 * 1024) });
const RenderDoneBody = z.object({ key: z.string().min(1) });

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
  /** The publish note: what you did, what they get. One line, required. */
  note: z.string().trim().min(1, "write one line on what changed").max(200),
  /** Details for engineers. Optional. */
  note_engineering: z.string().trim().max(2000).default(""),
});

const RollbackBody = z.object({ id: Ulid.optional(), version_id: Ulid });

function versionWire(row: typeof version.$inferSelect) {
  return { ...row, created_at: row.created_at.toISOString(), updated_at: row.updated_at.toISOString() };
}

/** The wire plus links to the render and the model, so the app never asks per version. The
 * render is an <img>, so the store's own signed URL serves it. The model is fetched by the
 * viewer, which needs CORS, so this server serves it under its own signed link. */
async function versionWithUrls(app: TypedApp, row: typeof version.$inferSelect) {
  return {
    ...versionWire(row),
    render_url: row.render_key ? await app.store.signGet(row.render_key) : null,
    model_url: row.model_key ? app.links.sign(modelPath(row.id, "glb"), app.now()) : null,
    fbx_url: row.fbx_key ? app.links.sign(modelPath(row.id, "fbx"), app.now()) : null,
  };
}

export function modelPath(versionId: string, ext: "glb" | "fbx"): string {
  return `/models/${versionId}.${ext}`;
}

const ModelParams = z.object({ vid: Ulid });
const LinkQuery = z.object({ exp: z.string().min(1), sig: z.string().min(1) });
/** The files this server streams under its own signed links: the GLB for the viewer, the FBX for the engineer. */
const SERVED: { ext: "glb" | "fbx"; column: "model_key" | "fbx_key"; type: string }[] = [
  { ext: "glb", column: "model_key", type: "model/gltf-binary" },
  { ext: "fbx", column: "fbx_key", type: "application/octet-stream" },
];

type Artifact = { kind: "render" | "model" | "fbx"; folder: string; ext: string; column: "render_key" | "model_key" | "fbx_key" };
const RENDER: Artifact = { kind: "render", folder: "renders", ext: "png", column: "render_key" };
const MODEL: Artifact = { kind: "model", folder: "models", ext: "glb", column: "model_key" };
/** The FBX the add-on exports on Publish, the file an engineer takes into the engine by hand. */
const FBX: Artifact = { kind: "fbx", folder: "exports", ext: "fbx", column: "fbx_key" };

export async function versionRoutes(app: TypedApp): Promise<void> {
  app.get("/parts/:id/versions", { schema: { params: IdParam } }, async (req) => {
    const { part: row } = await loadPart(app.db, req.principal, req.params.id);
    const rows = await app.db.select().from(version).where(eq(version.part_id, row.id)).orderBy(desc(version.created_at), desc(version.id));
    return { v: 1, versions: await Promise.all(rows.map((r) => versionWithUrls(app, r))) };
  });

  app.post("/parts/:id/versions", { schema: { params: IdParam, body: VersionBody } }, async (req, reply) => {
    const { part: row, asset: a } = await loadPart(app.db, req.principal, req.params.id);
    requireCanEdit(req.principal, row);
    await requireNotHeldByOther(app.db, req.principal, row.id, app.now());
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
      .values({
        id, studio_id: a.studio_id, part_id: row.id, author_id: req.principal.user_id, file_version_id: req.body.file_version_id, manifest: req.body.manifest, mirror_status: req.body.mirror_status, mirror_ms: req.body.mirror_ms, note: req.body.note,
        capture_eligible: await trainingOn(app.db, a.studio_id), opened_at: req.body.opened_at ? new Date(req.body.opened_at) : null, saved_at: req.body.saved_at ? new Date(req.body.saved_at) : now,
        created_at: now, updated_at: now,
      })
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
      const capture_eligible = await trainingOn(app.db, a.studio_id);
      await app.db.insert(check_run).values(
        req.body.results.map((c) => ({ id: newId(), studio_id: a.studio_id, version_id: ver.id, check_id: c.check_id, severity: c.severity, passed: c.passed, auto_fixed: c.auto_fixed, message: c.message, capture_eligible, created_at: now, updated_at: now })),
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
    await requireNotHeldByOther(app.db, req.principal, row.id, app.now());
    const ver = (await app.db.select().from(version).where(and(eq(version.id, req.body.version_id), eq(version.part_id, row.id))).limit(1))[0];
    if (!ver) throw notFound("version", req.body.version_id);
    const now = app.now();
    const training = await trainingOn(app.db, a.studio_id);
    if (req.body.check_results.length > 0) {
      await app.db.insert(check_run).values(
        req.body.check_results.map((c) => ({ id: newId(), studio_id: a.studio_id, version_id: ver.id, check_id: c.check_id, severity: c.severity, passed: c.passed, auto_fixed: c.auto_fixed, message: c.message, capture_eligible: training, created_at: now, updated_at: now })),
      );
    }
    const blocked_by = req.body.check_results.filter((c) => !c.passed && c.severity === "block");
    if (blocked_by.length > 0) {
      return { v: 1, published: false, version_id: ver.id, state: row.state, blocked_by };
    }
    // While the studio trains, nothing publishes until a reviewer has confirmed who holds the rights.
    if (training && !a.rights) {
      throw new AppError("rights_required", "confirm who holds the rights to this asset before Publish", { asset_id: a.id });
    }
    await app.db.update(version).set({ published: true, note: req.body.note, note_engineering: req.body.note_engineering, updated_at: now }).where(eq(version.id, ver.id));
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

  // The render (a PNG the agent captures in UE5 on Mark Ready, or Blender's viewport as the
  // fallback) and the model (the GLB the add-on exported, or the area export from Unreal) store
  // the same way. Three steps: a signed PUT URL, the upload by the agent, then done with the key.
  for (const art of [RENDER, MODEL, FBX]) {
    const keyOf = (studioId: string, partId: string, versionId: string) => `studios/${studioId}/${art.folder}/${partId}/${versionId}.${art.ext}`;
    app.post(`/parts/:id/versions/:vid/${art.kind}-url`, { schema: { params: VersionParams, body: RenderUrlBody } }, async (req) => {
      const { part: row, asset: a } = await loadPart(app.db, req.principal, req.params.id);
      requireCanEdit(req.principal, row);
      const ver = (await app.db.select({ id: version.id }).from(version).where(and(eq(version.id, req.params.vid), eq(version.part_id, row.id))).limit(1))[0];
      if (!ver) throw notFound("version", req.params.vid);
      const key = keyOf(a.studio_id, row.id, ver.id);
      return { v: 1, key, url: await app.store.signPut(key, req.body.size) };
    });

    app.put(`/parts/:id/versions/:vid/${art.kind}`, { schema: { params: VersionParams, body: RenderDoneBody } }, async (req) => {
      const { part: row, asset: a } = await loadPart(app.db, req.principal, req.params.id);
      requireCanEdit(req.principal, row);
      const ver = (await app.db.select().from(version).where(and(eq(version.id, req.params.vid), eq(version.part_id, row.id))).limit(1))[0];
      if (!ver) throw notFound("version", req.params.vid);
      const expected = keyOf(a.studio_id, row.id, ver.id);
      if (req.body.key !== expected) throw new AppError("bad_request", `the ${art.kind} key does not belong to this version`, { key: req.body.key });
      if ((await app.store.head(expected)) === null) throw new AppError("chunks_missing", `the ${art.kind} was not uploaded`, { key: expected });
      const now = app.now();
      const [saved] = await app.db.update(version).set({ [art.column]: expected, updated_at: now }).where(eq(version.id, ver.id)).returning();
      req.log.info({ project_id: a.project_id, part_id: row.id, version_id: ver.id }, `${art.kind} stored`);
      return { v: 1, version: await versionWithUrls(app, saved!) };
    });

    app.get(`/parts/:id/versions/:vid/${art.kind}`, { schema: { params: VersionParams } }, async (req) => {
      const { part: row } = await loadPart(app.db, req.principal, req.params.id);
      const ver = (await app.db.select().from(version).where(and(eq(version.id, req.params.vid), eq(version.part_id, row.id))).limit(1))[0];
      if (!ver) throw notFound("version", req.params.vid);
      const key = ver[art.column];
      if (!key) throw notFound(art.kind, ver.id);
      return { v: 1, version_id: ver.id, url: await app.store.signGet(key) };
    });
  }

  // The model bytes, under the link versionWithUrls hands out. No session: the signature is the
  // credential, as with a store URL. The auth hook lets /models/ through (app.ts).
  for (const served of SERVED) {
    app.get(`/models/:vid.${served.ext}`, { schema: { params: ModelParams, querystring: LinkQuery } }, async (req, reply) => {
      const path = modelPath(req.params.vid, served.ext);
      if (!app.links.verify(path, req.query.exp, req.query.sig, app.now())) throw new AppError("forbidden", "this link is not valid or has expired");
      const ver = (await app.db.select({ id: version.id, key: version[served.column] }).from(version).where(eq(version.id, req.params.vid)).limit(1))[0];
      if (!ver?.key) throw notFound(served.ext, req.params.vid);
      const object = await app.store.get(ver.key);
      if (!object) throw notFound(served.ext, req.params.vid);
      return reply
        .header("content-type", served.type)
        .header("content-length", String(object.size))
        .header("cache-control", "private, max-age=3600")
        .send(object.body);
    });
  }

  // The .blend as it was for this version: the file version of the part's file recorded by the
  // sync right after the save (the first one at or after the version), else the last one before.
  // Open previous version fetches it into the agent's folder and launches Blender on it.
  app.get("/parts/:id/versions/:vid/file", { schema: { params: VersionParams } }, async (req) => {
    const { part: row, asset: a } = await loadPart(app.db, req.principal, req.params.id);
    const ver = (await app.db.select().from(version).where(and(eq(version.id, req.params.vid), eq(version.part_id, row.id))).limit(1))[0];
    if (!ver) throw notFound("version", req.params.vid);
    if (row.mapping.kind !== "blend_collection") throw new AppError("bad_request", "this part has no Blender file", { part_id: row.id });
    const path = row.mapping.file;
    const after = (await app.db.select().from(file_version).where(and(eq(file_version.project_id, a.project_id), eq(file_version.path, path), gte(file_version.created_at, ver.created_at))).orderBy(asc(file_version.created_at)).limit(1))[0];
    const before = after ? undefined : (await app.db.select().from(file_version).where(and(eq(file_version.project_id, a.project_id), eq(file_version.path, path), lt(file_version.created_at, ver.created_at))).orderBy(desc(file_version.created_at)).limit(1))[0];
    const found = after ?? before;
    if (!found) throw notFound("file_version", path);
    return { v: 1, file_version: found, exact: !!after };
  });

  // Roll back: a new version that points at an older file_version. One click, nothing deleted.
  app.post("/parts/:id/rollback", { schema: { params: IdParam, body: RollbackBody } }, async (req, reply) => {
    const { part: row, asset: a } = await loadPart(app.db, req.principal, req.params.id);
    requireCanEdit(req.principal, row);
    await requireNotHeldByOther(app.db, req.principal, row.id, app.now());
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
