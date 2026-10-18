// Create an asset from a template: name, owners per part, reference files. One screen.
// Parts are created in template order, all of them or the ones named. A part whose gate names
// a created part starts Locked, the rest Draft. Rights are set by a reviewer and are required
// to Publish while the studio trains (docs/decisions.md, 2026-10-10).
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { AssetRights, Template, Ulid, type Gate, type PartMapping, type TemplatePart } from "@nkata/shared";
import { asset, part, template } from "../db/schema.js";
import { AppError, notFound } from "../domain/errors.js";
import { initialState } from "../domain/gates.js";
import { newId } from "../domain/ids.js";
import { TEMPLATES, templateFilePath } from "../domain/templates.js";
import { assetState, currentLock, IdParam, isReviewer, loadAsset, loadProject, partContext, partWire, requireRole, userRefs, type TypedApp } from "./_shared.js";

/** A path inside the project folder: relative, forward slashes, no step up, a .blend file. */
export const ProjectFile = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^(?!\/)(?!.*(^|\/)\.\.(\/|$))[^\\\0]+\.blend$/, "a .blend path inside the project folder");

const AssetBody = z.object({
  id: Ulid.optional(),
  project_id: Ulid,
  template_name: z.string().min(1),
  name: z.string().min(1).regex(/^[A-Za-z0-9][A-Za-z0-9 _/-]*$/),
  owners: z.record(z.string(), Ulid).default({}),
  reference_files: z.array(z.string()).default([]),
  /** Template part names to create. Absent: every part. */
  parts: z.array(z.string().min(1)).min(1).optional(),
  // v8: the wall's section, the first subfolder under the project folder.
  group: z.string().trim().min(1).max(60).regex(/^[^/\\\0]*$/, "a group name, no slashes").optional(),
  /** An existing .blend in the project folder per blend_collection part, project-relative with
   * forward slashes. The part maps to that file instead of the template's layout. */
  files: z.record(z.string(), ProjectFile).default({}),
});

const RightsBody = z.object({ statement: z.string().min(1) });

/** A folder the team named. Empty moves the asset back to the project's root list. */
const FolderBody = z.object({
  folder: z.string().trim().max(60).regex(/^[^/\\\0]*$/, "a folder name, no slashes").optional(),
  // v8: the wall's section, or null for the root. A lead's triangle override, or null to clear it.
  group: z.string().trim().min(1).max(60).regex(/^[^/\\\0]*$/, "a group name, no slashes").nullable().optional(),
  budget: z.number().int().min(1).nullable().optional(),
});

/** A level area asset is named "<level> / <area>". Without the slash the level is the asset and the area is the part. */
export function levelAndArea(assetName: string, partName: string): { level: string; area: string } {
  const slash = assetName.indexOf(" / ");
  if (slash < 0) return { level: assetName, area: partName };
  return { level: assetName.slice(0, slash).trim(), area: assetName.slice(slash + 3).trim() };
}

/** Where a part lives on disk and in the engine, from the template rules. See docs/decisions.md. */
export function mappingFor(tpl: Template, tp: TemplatePart, assetName: string, file?: string): PartMapping {
  const fill = (s: string) => s.replaceAll("{asset}", assetName).replaceAll("{part}", tp.name);
  switch (tp.mapping) {
    case "ue_area": {
      const { level, area } = levelAndArea(assetName, tp.name);
      return { kind: "ue_area", level, area };
    }
    case "blend_collection":
      return { kind: "blend_collection", file: file ?? (tpl.blend_layout === "one_file_per_part" ? `${assetName}/${tp.name}.blend` : `${assetName}/${assetName}.blend`), collection: tp.name };
    case "ue_asset":
      return { kind: "ue_asset", path: fill(tpl.export.ue_path) };
    case "ue_actor":
      return { kind: "ue_actor", level: assetName, actor: fill(tpl.export.name) };
    case "file":
      return { kind: "file", path: `${assetName}/${tp.name}` };
  }
}

export async function assetRoutes(app: TypedApp): Promise<void> {
  app.post("/assets", { schema: { body: AssetBody } }, async (req, reply) => {
    // v8: an artist's save of a new .blend makes an asset of their own (every part theirs).
    requireRole(req.principal, ["artist", "art_director", "producer"], "creating an asset");
    if (!isReviewer(req.principal)) {
      const owners = Object.values(req.body.owners);
      if (owners.length === 0 || owners.some((o) => o !== req.principal.user_id)) throw new AppError("forbidden", "an artist creates an asset of their own: every part owned by them", { template: req.body.template_name });
    }
    const proj = await loadProject(app.db, req.principal, req.body.project_id);
    const id = req.body.id ?? newId();
    const existing = await app.db.select().from(asset).where(eq(asset.id, id)).limit(1);
    if (existing[0]) return { v: 1, asset: existing[0] };

    let tplRow = (await app.db
      .select()
      .from(template)
      .where(and(eq(template.project_id, proj.id), eq(template.name, req.body.template_name)))
      .limit(1))[0];
    if (!tplRow) {
      // A project made before a standard template existed gets it on first use (v8: Object, Environment).
      const standard = TEMPLATES.find((t) => t.name === req.body.template_name);
      if (!standard) throw notFound("template", req.body.template_name);
      const now = app.now();
      [tplRow] = await app.db.insert(template).values({ id: newId(), studio_id: proj.studio_id, project_id: proj.id, name: standard.name, file_path: templateFilePath(standard.name), schema: standard, created_at: now, updated_at: now }).returning();
      if (!tplRow) throw notFound("template", req.body.template_name);
    }
    const tpl = Template.parse(tplRow.schema);
    const partNames = new Set(tpl.parts.map((p) => p.name));
    for (const owner of Object.keys(req.body.owners)) {
      if (!partNames.has(owner)) throw new AppError("bad_request", `owner given for unknown part "${owner}"`, { template: tpl.name });
    }
    for (const name of req.body.parts ?? []) {
      if (!partNames.has(name)) throw new AppError("bad_request", `the template has no part "${name}"`, { template: tpl.name });
    }
    const chosen = req.body.parts ? tpl.parts.filter((tp) => req.body.parts!.includes(tp.name)) : tpl.parts;
    const chosenNames = chosen.map((tp) => tp.name);
    for (const [name, file] of Object.entries(req.body.files)) {
      const tp = chosen.find((p) => p.name === name);
      if (!tp) throw new AppError("bad_request", `file given for a part not being created: "${name}"`, { template: tpl.name });
      if (tp.mapping !== "blend_collection") throw new AppError("bad_request", `part "${name}" is not a Blender part, so it takes no file`, { template: tpl.name });
      const taken = await app.db.select({ id: part.id }).from(part).innerJoin(asset, eq(part.asset_id, asset.id)).where(and(eq(asset.project_id, proj.id), sql`${part.mapping}->>'file' = ${file}`)).limit(1);
      if (taken[0]) throw new AppError("conflict", `${file} already belongs to a part`, { part_id: taken[0].id });
    }

    const now = app.now();
    const created = await app.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(asset)
        .values({ id, studio_id: proj.studio_id, project_id: proj.id, template_id: tplRow.id, name: req.body.name, reference_files: req.body.reference_files, kind: tpl.kind === "level_area" ? "environment" : "object", group: req.body.group ?? null, created_at: now, updated_at: now })
        .returning();
      const partRows = chosen.map((tp, position) => {
        const gate: Gate = { after: tp.gate ?? [] };
        const state = initialState(gate, chosenNames);
        return {
          id: newId(), studio_id: proj.studio_id, asset_id: id, name: tp.name, position,
          owner_id: req.body.owners[tp.name] ?? null, state, gate, mapping: mappingFor(tpl, tp, req.body.name, req.body.files[tp.name]), created_at: now, updated_at: now,
        };
      });
      const parts = await tx.insert(part).values(partRows).returning();
      return { asset: row, parts };
    });
    await app.bus.audit({
      studio_id: proj.studio_id, project_id: proj.id, actor_id: req.principal.user_id,
      kind: "audit.asset_created", target_kind: "asset", target_id: id, payload: { name: req.body.name, template: tpl.name },
    });
    req.log.info({ project_id: proj.id, asset_id: id }, "asset created");
    const ctx = { asset_name: created.asset!.name, template: tpl, reference_files: created.asset!.reference_files, siblings: created.parts.map((p) => ({ name: p.name, state: p.state })) };
    return reply.status(201).send({ v: 1, asset: created.asset, parts: created.parts.map((p) => partWire(p, ctx, null, null)) });
  });

  // Who holds the rights. An art director or producer confirms it in one line.
  app.put("/assets/:id/rights", { schema: { params: IdParam, body: RightsBody } }, async (req) => {
    requireRole(req.principal, ["art_director", "producer"], "confirming rights");
    const a = await loadAsset(app.db, req.principal, req.params.id);
    const now = app.now();
    const rights = AssetRights.parse({ statement: req.body.statement, confirmed_by: req.principal.user_id, confirmed_at: now.toISOString() });
    const [saved] = await app.db.update(asset).set({ rights, updated_at: now }).where(eq(asset.id, a.id)).returning();
    await app.bus.audit({ studio_id: a.studio_id, project_id: a.project_id, actor_id: req.principal.user_id, kind: "audit.rights_confirmed", target_kind: "asset", target_id: a.id, payload: rights });
    return { v: 1, asset: saved };
  });

  // Folders are names the team gives, not paths: one word per asset, listed at the top of the
  // project screen. Any member who can edit moves an asset; the same name twice is one folder.
  app.put("/assets/:id", { schema: { params: IdParam, body: FolderBody } }, async (req) => {
    requireRole(req.principal, ["artist", "art_director", "producer"], "moving an asset");
    if (req.body.budget !== undefined) requireRole(req.principal, ["art_director", "producer"], "setting a budget");
    const a = await loadAsset(app.db, req.principal, req.params.id);
    const next = {
      folder: req.body.folder ?? a.folder,
      group: req.body.group === undefined ? a.group : req.body.group,
      budget: req.body.budget === undefined ? a.budget : req.body.budget,
    };
    if (next.folder === a.folder && next.group === a.group && next.budget === a.budget) return { v: 1, asset: a };
    const now = app.now();
    const [saved] = await app.db.update(asset).set({ ...next, updated_at: now }).where(eq(asset.id, a.id)).returning();
    await app.bus.audit({ studio_id: a.studio_id, project_id: a.project_id, actor_id: req.principal.user_id, kind: "audit.asset_moved", target_kind: "asset", target_id: a.id, payload: { from: { folder: a.folder, group: a.group, budget: a.budget }, to: next } });
    return { v: 1, asset: saved };
  });

  app.get("/assets", { schema: { querystring: z.object({ project_id: Ulid }) } }, async (req) => {
    const proj = await loadProject(app.db, req.principal, req.query.project_id);
    const assets = await app.db.select().from(asset).where(eq(asset.project_id, proj.id));
    const parts = await app.db.select({ asset_id: part.asset_id, state: part.state }).from(part).where(eq(part.studio_id, proj.studio_id));
    return {
      v: 1,
      assets: assets.map((a) => ({ ...a, state: assetState(parts.filter((p) => p.asset_id === a.id).map((p) => p.state)) })),
    };
  });

  app.get("/assets/:id", { schema: { params: IdParam } }, async (req) => {
    const a = await loadAsset(app.db, req.principal, req.params.id);
    const parts = await app.db.select().from(part).where(eq(part.asset_id, a.id)).orderBy(part.position);
    const owners = await userRefs(app.db, parts.map((p) => p.owner_id).filter((x): x is string => x !== null));
    const now = app.now();
    const ctx = await partContext(app.db, a);
    const wired = [];
    for (const p of parts) wired.push(partWire(p, ctx, p.owner_id ? owners.get(p.owner_id) ?? null : null, await currentLock(app.db, p.id, now)));
    return { v: 1, asset: { ...a, state: assetState(parts.map((p) => p.state)) }, parts: wired };
  });
}
