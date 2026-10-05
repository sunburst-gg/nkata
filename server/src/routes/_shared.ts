// Helpers every route file uses: typed app, membership checks, row lookups, row to wire shapes.
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { Template, Ulid, type CheckSpec, type LockInfo, type PartState, type Role, type TemplateKind, type UserRef } from "@nkata/shared";
import { checkSeverity } from "../domain/checks.js";
import type { Principal } from "../auth/tokens.js";
import type { Db } from "../db/client.js";
import { asset, lock, part, project, template, user } from "../db/schema.js";
import { AppError, notFound } from "../domain/errors.js";
import { isStale } from "../domain/locks.js";

export type TypedApp = FastifyInstance<
  import("fastify").RawServerDefault,
  import("fastify").RawRequestDefaultExpression,
  import("fastify").RawReplyDefaultExpression,
  import("fastify").FastifyBaseLogger,
  ZodTypeProvider
>;

export const IdParam = z.object({ id: Ulid });

export function requireRole(p: Principal, roles: Role[], what: string): void {
  if (!p.roles.some((r) => roles.includes(r))) {
    throw new AppError("forbidden", `${what} needs one of: ${roles.join(", ")}`, { roles: p.roles });
  }
}

export const REVIEWERS: Role[] = ["art_director", "producer"];

export function isReviewer(p: Principal): boolean {
  return p.roles.some((r) => REVIEWERS.includes(r));
}

export async function loadProject(db: Db, p: Principal, projectId: string) {
  const rows = await db.select().from(project).where(and(eq(project.id, projectId), eq(project.studio_id, p.studio_id))).limit(1);
  const row = rows[0];
  if (!row) throw notFound("project", projectId);
  return row;
}

export type PartRow = typeof part.$inferSelect;
export type AssetRow = typeof asset.$inferSelect;

export async function loadPart(db: Db, p: Principal, partId: string): Promise<{ part: PartRow; asset: AssetRow }> {
  const rows = await db
    .select({ part, asset })
    .from(part)
    .innerJoin(asset, eq(asset.id, part.asset_id))
    .where(and(eq(part.id, partId), eq(part.studio_id, p.studio_id)))
    .limit(1);
  const row = rows[0];
  if (!row) throw notFound("part", partId);
  return row;
}

export async function loadAsset(db: Db, p: Principal, assetId: string): Promise<AssetRow> {
  const rows = await db.select().from(asset).where(and(eq(asset.id, assetId), eq(asset.studio_id, p.studio_id))).limit(1);
  const row = rows[0];
  if (!row) throw notFound("asset", assetId);
  return row;
}

export async function userRef(db: Db, userId: string): Promise<UserRef> {
  const rows = await db.select({ id: user.id, name: user.name, avatar_url: user.avatar_url }).from(user).where(eq(user.id, userId)).limit(1);
  const row = rows[0];
  if (!row) throw notFound("user", userId);
  return row;
}

export async function userRefs(db: Db, ids: string[]): Promise<Map<string, UserRef>> {
  const unique = [...new Set(ids)];
  const out = new Map<string, UserRef>();
  for (const id of unique) out.set(id, await userRef(db, id));
  return out;
}

export function toLockInfo(row: typeof lock.$inferSelect, holder: UserRef, now: Date): LockInfo {
  return {
    holder,
    granted_at: row.granted_at.toISOString(),
    heartbeat_at: row.heartbeat_at.toISOString(),
    expires_at: row.expires_at.toISOString(),
    stale: isStale(row, now),
  };
}

export async function currentLock(db: Db, partId: string, now: Date): Promise<LockInfo | null> {
  const rows = await db.select().from(lock).where(eq(lock.part_id, partId)).limit(1);
  const row = rows[0];
  if (!row || row.expires_at.getTime() <= now.getTime()) return null;
  return toLockInfo(row, await userRef(db, row.holder_id), now);
}

/** The template kind of an asset, from the cached template row. Picks the import script. */
export async function templateKind(db: Db, templateId: string): Promise<TemplateKind> {
  return (await templateOf(db, templateId)).kind;
}

export async function templateOf(db: Db, templateId: string): Promise<Template> {
  const rows = await db.select({ schema: template.schema }).from(template).where(eq(template.id, templateId)).limit(1);
  const row = rows[0];
  if (!row) throw notFound("template", templateId);
  return Template.parse(row.schema);
}

/** What every part of one asset shares on the wire: the template, the reference, and the siblings for gates. */
export type PartContext = { asset_name: string; template: Template; reference_files: string[]; siblings: { name: string; state: PartState }[] };

export async function partContext(db: Db, a: AssetRow): Promise<PartContext> {
  const tpl = await templateOf(db, a.template_id);
  const siblings = await db.select({ name: part.name, state: part.state }).from(part).where(eq(part.asset_id, a.id));
  return { asset_name: a.name, template: tpl, reference_files: a.reference_files, siblings };
}

/** The checks a template runs on a part, with severity from the contract and params from the template. */
export function checkSpecs(tpl: Template, partName: string): CheckSpec[] {
  const tp = tpl.parts.find((x) => x.name === partName);
  if (!tp) return [];
  return tp.checks.map((id) => ({ id, severity: checkSeverity(id), params: (tp.params?.[id] as Record<string, unknown> | undefined) ?? {} }));
}

export function partWire(row: PartRow, ctx: PartContext, owner: UserRef | null, lockInfo: LockInfo | null) {
  return {
    id: row.id,
    asset_id: row.asset_id,
    asset_name: ctx.asset_name,
    kind: ctx.template.kind,
    checks: checkSpecs(ctx.template, row.name),
    reference_files: ctx.reference_files,
    waiting_on: row.gate.after.filter((name) => ctx.siblings.find((s) => s.name === name)?.state !== "approved"),
    name: row.name,
    position: row.position,
    state: row.state,
    owner,
    owner_id: row.owner_id,
    lock: lockInfo,
    gate: row.gate,
    mapping: row.mapping,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

/** Asset state, derived from its parts, never stored. */
export function assetState(states: PartState[]): "locked" | "draft" | "ready" | "approved" | "complete" {
  if (states.length === 0) return "draft";
  if (states.every((s) => s === "approved")) return "complete";
  if (states.some((s) => s === "draft")) return "draft";
  if (states.some((s) => s === "ready")) return "ready";
  if (states.some((s) => s === "locked")) return "locked";
  return "approved";
}

/** Only the part owner, an art director, or a producer may write to a part. */
export function requireCanEdit(p: Principal, row: PartRow): void {
  if (row.owner_id === p.user_id || isReviewer(p)) return;
  throw new AppError("forbidden", "only the owner, an art director, or a producer can edit this part", { part_id: row.id });
}

/** No overwrite: while someone else holds the editor lock, nobody else writes a version. */
export async function requireNotHeldByOther(db: Db, p: Principal, partId: string, now: Date): Promise<void> {
  const rows = await db.select().from(lock).where(eq(lock.part_id, partId)).limit(1);
  const row = rows[0];
  if (!row || row.expires_at.getTime() <= now.getTime() || row.holder_id === p.user_id) return;
  const holder = await userRef(db, row.holder_id);
  throw new AppError("lock_held", `${holder.name} has this part`, { part_id: partId, holder: holder.id });
}
