import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { Role, Template, Training, Ulid } from "@nkata/shared";
import { asset, membership, project, studio, template, user } from "../db/schema.js";
import type { Principal } from "../auth/tokens.js";
import { projectInviteEmail, studioInviteEmail } from "../domain/emails.js";
import { AppError } from "../domain/errors.js";
import { encryptWebhook, isWebhookUrl } from "../domain/discord.js";
import { newId } from "../domain/ids.js";
import { TEMPLATES, templateFilePath } from "../domain/templates.js";
import { IdParam, loadProject, requireRole, userRef, type TypedApp } from "./_shared.js";

/** True when someone other than `userId` is a producer of the studio. */
async function otherProducer(app: TypedApp, studioId: string, userId: string): Promise<boolean> {
  const rows = await app.db.select({ user_id: membership.user_id, roles: membership.roles }).from(membership).where(eq(membership.studio_id, studioId));
  return rows.some((r) => r.user_id !== userId && r.roles.includes("producer"));
}

const ProjectBody = z.object({
  id: Ulid.optional(),
  name: z.string().min(1),
  folder_name: z.string().min(1).regex(/^[A-Za-z0-9._-]+$/),
  blender_version: z.string().min(1),
  ue_version: z.string().min(1),
  package_version: z.string().min(1),
});

/** The billing line. Nkata is free while studios test it, whatever the training setting, and no
 * payment code exists yet: the seat count only (docs/decisions.md, 2026-10-10 and 2026-10-14). */
export const FREE_LINE = "Free while Nkata is in testing";
export function billingFor(_training: Training, seats: number): { line: string; seats: number } {
  return { line: FREE_LINE, seats };
}

/** A project on the wire: the webhook stays in the row. */
export function projectWire(row: typeof project.$inferSelect) {
  const { discord_webhook, deleted_at, ...rest } = row;
  void deleted_at;
  return { ...rest, discord_configured: discord_webhook !== null };
}

const studioWire = (row: typeof studio.$inferSelect, seats: number) => ({ id: row.id, name: row.name, member_count: seats, training: row.training, billing: billingFor(row.training, seats) });

async function seatCount(app: TypedApp, studioId: string): Promise<number> {
  return (await app.db.select({ id: membership.id }).from(membership).where(eq(membership.studio_id, studioId))).length;
}

const memberWire = (r: { id: string; name: string; avatar_url: string | null; email: string; roles: Role[] }) => ({ user: { id: r.id, name: r.name, avatar_url: r.avatar_url }, email: r.email, roles: r.roles });

async function listMembers(app: TypedApp, studioId: string) {
  const rows = await app.db
    .select({ id: user.id, name: user.name, avatar_url: user.avatar_url, email: user.email, roles: membership.roles })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.user_id))
    .where(eq(membership.studio_id, studioId))
    .orderBy(user.name);
  return rows.map(memberWire);
}

/**
 * Invite: adds a person to the studio by email with roles. One account, many studios. Roles
 * replace. A new membership sends the invite email: the studio one, or the project one with the
 * note when the invite came through a project. A roles change sends nothing.
 */
async function invite(app: TypedApp, req: { principal: Principal; log: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void } }, body: { email: string; name?: string | undefined; roles: Role[]; note?: string | undefined }, proj: typeof project.$inferSelect | null): Promise<{ created: boolean; member: ReturnType<typeof memberWire> }> {
  const now = app.now();
  const email = body.email.toLowerCase();
  let u = (await app.db.select().from(user).where(eq(user.email, email)).limit(1))[0];
  if (!u) [u] = await app.db.insert(user).values({ id: newId(), email, name: body.name ?? "", avatar_url: null, created_at: now, updated_at: now }).returning();
  const m = (await app.db.select().from(membership).where(and(eq(membership.user_id, u!.id), eq(membership.studio_id, req.principal.studio_id))).limit(1))[0];
  if (m) await app.db.update(membership).set({ roles: body.roles, updated_at: now }).where(eq(membership.id, m.id));
  else await app.db.insert(membership).values({ id: newId(), studio_id: req.principal.studio_id, user_id: u!.id, roles: body.roles, created_at: now, updated_at: now });
  await app.bus.audit({
    studio_id: req.principal.studio_id, project_id: proj?.id ?? null, actor_id: req.principal.user_id,
    kind: m ? "audit.roles_set" : "audit.member_invited", target_kind: "user", target_id: u!.id, payload: { email, roles: body.roles },
  });
  if (!m && app.mailer.configured) {
    const st = (await app.db.select().from(studio).where(eq(studio.id, req.principal.studio_id)).limit(1))[0];
    const role = body.roles.includes("producer") ? "producer" : body.roles.includes("art_director") ? "art_director" : body.roles[0]!;
    const inviter = { name: req.principal.name || req.principal.email, email: req.principal.email };
    const href = `${app.config.PUBLIC_URL}/join?email=${encodeURIComponent(email)}`;
    const mail = proj
      ? projectInviteEmail({ to: email, project: { name: proj.name, studio: st?.name ?? "", assets: await assetCount(app, proj.id), people: await seatCount(app, req.principal.studio_id) }, role, inviter, note: body.note?.trim() || null, href })
      : studioInviteEmail({ to: email, studio: st?.name ?? "", role, inviter, href });
    try {
      await app.mailer.send(mail);
      req.log.info({ user_id: u!.id, project_id: proj?.id ?? null }, "invite sent");
    } catch (err) {
      // The membership stands; the person can still sign in with their email. The producer sees the list.
      req.log.warn({ err, user_id: u!.id }, "invite email not sent");
    }
  }
  return { created: !m, member: memberWire({ id: u!.id, name: u!.name, avatar_url: u!.avatar_url, email, roles: body.roles }) };
}

async function assetCount(app: TypedApp, projectId: string): Promise<number> {
  return (await app.db.select({ id: asset.id }).from(asset).where(eq(asset.project_id, projectId))).length;
}

export async function projectRoutes(app: TypedApp): Promise<void> {
  app.get("/studio", async (req) => {
    const rows = await app.db.select().from(studio).where(eq(studio.id, req.principal.studio_id)).limit(1);
    const row = rows[0];
    if (!row) throw new AppError("not_found", "studio not found");
    return { v: 1, studio: studioWire(row, await seatCount(app, row.id)) };
  });

  app.put("/studio", { schema: { body: z.object({ name: z.string().trim().min(1) }) } }, async (req) => {
    requireRole(req.principal, ["producer"], "renaming the studio");
    const [row] = await app.db.update(studio).set({ name: req.body.name, updated_at: app.now() }).where(eq(studio.id, req.principal.studio_id)).returning();
    if (!row) throw new AppError("not_found", "studio not found");
    await app.bus.audit({ studio_id: row.id, project_id: null, actor_id: req.principal.user_id, kind: "audit.studio_renamed", target_kind: "studio", target_id: row.id, payload: { name: row.name } });
    return { v: 1, studio: studioWire(row, await seatCount(app, row.id)) };
  });

  // The studio's members. Producers invite, change roles, and remove; everyone can see the list.
  app.get("/studio/members", async (req) => ({ v: 1, members: await listMembers(app, req.principal.studio_id) }));

  app.post("/studio/members", { schema: { body: z.object({ email: z.email(), name: z.string().min(1).optional(), roles: z.array(Role).min(1) }) } }, async (req, reply) => {
    requireRole(req.principal, ["producer"], "inviting a member");
    const out = await invite(app, req, req.body, null);
    return reply.status(out.created ? 201 : 200).send({ v: 1, member: out.member });
  });

  app.put("/studio/members/:id", { schema: { params: IdParam, body: z.object({ roles: z.array(Role).min(1) }) } }, async (req) => {
    requireRole(req.principal, ["producer"], "changing a role");
    const now = app.now();
    const rows = await app.db.update(membership).set({ roles: req.body.roles, updated_at: now }).where(and(eq(membership.studio_id, req.principal.studio_id), eq(membership.user_id, req.params.id))).returning();
    if (!rows[0]) throw new AppError("not_found", "that person is not a member");
    if (req.params.id === req.principal.user_id && !req.body.roles.includes("producer") && !(await otherProducer(app, req.principal.studio_id, req.principal.user_id))) {
      await app.db.update(membership).set({ roles: req.principal.roles, updated_at: now }).where(eq(membership.id, rows[0].id));
      throw new AppError("conflict", "a studio keeps at least one producer");
    }
    await app.bus.audit({ studio_id: req.principal.studio_id, project_id: null, actor_id: req.principal.user_id, kind: "audit.roles_set", target_kind: "user", target_id: req.params.id, payload: { roles: req.body.roles } });
    const u = await userRef(app.db, req.params.id);
    return { v: 1, member: { user: u, roles: req.body.roles } };
  });

  app.delete("/studio/members/:id", { schema: { params: IdParam } }, async (req) => {
    requireRole(req.principal, ["producer"], "removing a member");
    if (req.params.id === req.principal.user_id && !(await otherProducer(app, req.principal.studio_id, req.principal.user_id))) throw new AppError("conflict", "a studio keeps at least one producer");
    const rows = await app.db.delete(membership).where(and(eq(membership.studio_id, req.principal.studio_id), eq(membership.user_id, req.params.id))).returning();
    if (!rows[0]) throw new AppError("not_found", "that person is not a member");
    await app.bus.audit({ studio_id: req.principal.studio_id, project_id: null, actor_id: req.principal.user_id, kind: "audit.member_removed", target_kind: "user", target_id: req.params.id, payload: {} });
    return { v: 1, removed: true };
  });

  // Training on: the studio contributes to model training and pays nothing. Off: billed per seat.
  app.put("/studio/training", { schema: { body: z.object({ training: Training }) } }, async (req) => {
    requireRole(req.principal, ["producer"], "changing the training setting");
    const rows = await app.db.select().from(studio).where(eq(studio.id, req.principal.studio_id)).limit(1);
    const row = rows[0];
    if (!row) throw new AppError("not_found", "studio not found");
    const now = app.now();
    if (row.training !== req.body.training) {
      await app.db.update(studio).set({ training: req.body.training, updated_at: now }).where(eq(studio.id, row.id));
      await app.bus.emit({
        studio_id: row.id, target_kind: "studio", target_id: row.id,
        message: { v: 1, kind: "studio.training", project_id: null, actor_id: req.principal.user_id, at: now.toISOString(), training: req.body.training },
      });
      req.log.info({ studio_id: row.id, training: req.body.training }, "training changed");
    }
    const members = await app.db.select({ id: membership.id }).from(membership).where(eq(membership.studio_id, row.id));
    return { v: 1, studio: { id: row.id, name: row.name, member_count: members.length, training: req.body.training, billing: billingFor(req.body.training, members.length) } };
  });

  // The member acknowledges that their work may be captured for training. Sets a pseudonymous id once.
  app.post("/me/capture-ack", async (req) => {
    const now = app.now();
    const rows = await app.db.select().from(membership).where(and(eq(membership.user_id, req.principal.user_id), eq(membership.studio_id, req.principal.studio_id))).limit(1);
    const m = rows[0];
    if (!m) throw new AppError("not_found", "membership not found");
    const ack = m.capture_ack_at ?? now;
    if (!m.capture_ack_at) await app.db.update(membership).set({ capture_ack_at: ack, updated_at: now }).where(eq(membership.id, m.id));
    const u = (await app.db.select({ training_id: user.training_id }).from(user).where(eq(user.id, req.principal.user_id)).limit(1))[0];
    let trainingId = u?.training_id ?? null;
    if (!trainingId) {
      trainingId = newId();
      await app.db.update(user).set({ training_id: trainingId, updated_at: now }).where(eq(user.id, req.principal.user_id));
    }
    return { v: 1, capture_ack_at: ack.toISOString(), training_id: trainingId };
  });

  app.get("/projects", async (req) => {
    const rows = await app.db.select().from(project).where(and(eq(project.studio_id, req.principal.studio_id), isNull(project.deleted_at))).orderBy(project.created_at);
    return { v: 1, projects: rows.map(projectWire) };
  });

  // Deleted projects, for the Restore list. Producers only.
  app.get("/projects/deleted", async (req) => {
    requireRole(req.principal, ["producer"], "listing deleted projects");
    const rows = await app.db.select().from(project).where(and(eq(project.studio_id, req.principal.studio_id), isNotNull(project.deleted_at))).orderBy(project.updated_at);
    return { v: 1, projects: rows.map((r) => ({ ...projectWire(r), deleted_at: r.deleted_at?.toISOString() ?? null })) };
  });

  app.post("/projects/:id/restore", { schema: { params: IdParam } }, async (req) => {
    requireRole(req.principal, ["producer"], "restoring a project");
    const rows = await app.db.update(project).set({ deleted_at: null, updated_at: app.now() }).where(and(eq(project.id, req.params.id), eq(project.studio_id, req.principal.studio_id), isNotNull(project.deleted_at))).returning();
    if (!rows[0]) throw new AppError("not_found", "no deleted project with that id");
    await app.bus.audit({ studio_id: req.principal.studio_id, project_id: rows[0].id, actor_id: req.principal.user_id, kind: "audit.project_restored", target_kind: "project", target_id: rows[0].id, payload: { name: rows[0].name } });
    return { v: 1, project: projectWire(rows[0]) };
  });

  app.put("/projects/:id", { schema: { params: IdParam, body: z.object({ name: z.string().trim().min(1) }) } }, async (req) => {
    requireRole(req.principal, ["producer"], "renaming a project");
    const proj = await loadProject(app.db, req.principal, req.params.id);
    const [row] = await app.db.update(project).set({ name: req.body.name, updated_at: app.now() }).where(eq(project.id, proj.id)).returning();
    await app.bus.audit({ studio_id: proj.studio_id, project_id: proj.id, actor_id: req.principal.user_id, kind: "audit.project_renamed", target_kind: "project", target_id: proj.id, payload: { name: req.body.name } });
    return { v: 1, project: projectWire(row!) };
  });

  // Delete project: the folder on disk stays, and so do the rows. Nkata stops showing it.
  app.delete("/projects/:id", { schema: { params: IdParam } }, async (req) => {
    requireRole(req.principal, ["producer"], "deleting a project");
    const proj = await loadProject(app.db, req.principal, req.params.id);
    const now = app.now();
    await app.db.update(project).set({ deleted_at: now, updated_at: now }).where(eq(project.id, proj.id));
    await app.bus.audit({ studio_id: proj.studio_id, project_id: proj.id, actor_id: req.principal.user_id, kind: "audit.project_deleted", target_kind: "project", target_id: proj.id, payload: { name: proj.name } });
    req.log.info({ project_id: proj.id }, "project deleted");
    return { v: 1, deleted: true };
  });

  app.post("/projects", { schema: { body: ProjectBody } }, async (req, reply) => {
    requireRole(req.principal, ["producer"], "creating a project");
    const id = req.body.id ?? newId();
    const existing = await app.db.select().from(project).where(eq(project.id, id)).limit(1);
    if (existing[0]) return { v: 1, project: projectWire(existing[0]) };
    const now = app.now();
    // A project starts with the standard templates, so Create asset has something to pick from.
    const row = await app.db.transaction(async (tx) => {
      const [made] = await tx
        .insert(project)
        .values({ ...req.body, id, studio_id: req.principal.studio_id })
        .returning();
      await tx.insert(template).values(
        TEMPLATES.map((schema) => ({ id: newId(), studio_id: req.principal.studio_id, project_id: id, name: schema.name, file_path: templateFilePath(schema.name), schema, created_at: now, updated_at: now })),
      );
      return made!;
    });
    await app.bus.audit({
      studio_id: req.principal.studio_id, project_id: id, actor_id: req.principal.user_id,
      kind: "audit.project_created", target_kind: "project", target_id: id, payload: { name: req.body.name },
    });
    return reply.status(201).send({ v: 1, project: projectWire(row) });
  });

  app.get("/projects/:id", { schema: { params: IdParam } }, async (req) => {
    return { v: 1, project: projectWire(await loadProject(app.db, req.principal, req.params.id)) };
  });

  app.get("/projects/:id/templates", { schema: { params: IdParam } }, async (req) => {
    const proj = await loadProject(app.db, req.principal, req.params.id);
    const rows = await app.db.select().from(template).where(eq(template.project_id, proj.id));
    return { v: 1, templates: rows };
  });

  // The file in the project folder is the truth; this row is the cache. The agent posts it on every change.
  app.put(
    "/projects/:id/templates/:name",
    { schema: { params: z.object({ id: Ulid, name: z.string().min(1) }), body: z.object({ file_path: z.string().min(1), schema: Template }) } },
    async (req) => {
      requireRole(req.principal, ["art_director", "producer"], "editing a template");
      const proj = await loadProject(app.db, req.principal, req.params.id);
      if (req.body.schema.name !== req.params.name) {
        return { v: 1, error: { code: "bad_request", message: "template name in the file must match the URL" } };
      }
      const now = app.now();
      const existing = await app.db
        .select()
        .from(template)
        .where(and(eq(template.project_id, proj.id), eq(template.name, req.params.name)))
        .limit(1);
      if (existing[0]) {
        const [row] = await app.db
          .update(template)
          .set({ file_path: req.body.file_path, schema: req.body.schema, updated_at: now })
          .where(eq(template.id, existing[0].id))
          .returning();
        return { v: 1, template: row };
      }
      const [row] = await app.db
        .insert(template)
        .values({ id: newId(), studio_id: proj.studio_id, project_id: proj.id, name: req.params.name, file_path: req.body.file_path, schema: req.body.schema })
        .returning();
      return { v: 1, template: row };
    },
  );

  // Members through a project: the same studio list, kept for the agent and older callers.
  app.get("/projects/:id/members", { schema: { params: IdParam } }, async (req) => {
    const proj = await loadProject(app.db, req.principal, req.params.id);
    return { v: 1, members: await listMembers(app, proj.studio_id) };
  });

  app.post(
    "/projects/:id/members",
    { schema: { params: IdParam, body: z.object({ email: z.email(), name: z.string().min(1).optional(), roles: z.array(Role).min(1), note: z.string().max(500).optional() }) } },
    async (req, reply) => {
      requireRole(req.principal, ["producer"], "inviting a member");
      const proj = await loadProject(app.db, req.principal, req.params.id);
      const out = await invite(app, req, req.body, proj);
      return reply.status(out.created ? 201 : 200).send({ v: 1, member: out.member });
    },
  );

  // The one Discord hook: a webhook URL per project, set by a producer, encrypted at rest.
  app.put("/projects/:id/discord", { schema: { params: IdParam, body: z.object({ webhook_url: z.string().nullable() }) } }, async (req) => {
    requireRole(req.principal, ["producer"], "setting the Discord webhook");
    const proj = await loadProject(app.db, req.principal, req.params.id);
    const url = req.body.webhook_url;
    if (url !== null && !isWebhookUrl(url)) throw new AppError("bad_request", "webhook_url must be an http or https URL");
    if (url !== null && !app.config.DISCORD_SECRET) throw new AppError("bad_request", "the server has no DISCORD_SECRET, so a webhook cannot be stored");
    const stored = url === null ? null : encryptWebhook(url, app.config.DISCORD_SECRET!);
    await app.db.update(project).set({ discord_webhook: stored, updated_at: app.now() }).where(eq(project.id, proj.id));
    await app.bus.audit({ studio_id: proj.studio_id, project_id: proj.id, actor_id: req.principal.user_id, kind: "audit.discord_set", target_kind: "project", target_id: proj.id, payload: { configured: url !== null } });
    return { v: 1, configured: url !== null };
  });

  app.get("/projects/:id/discord", { schema: { params: IdParam } }, async (req) => {
    const proj = await loadProject(app.db, req.principal, req.params.id);
    return { v: 1, configured: proj.discord_webhook !== null };
  });
}
