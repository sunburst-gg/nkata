import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { Role, Template, Training, Ulid } from "@nkata/shared";
import { membership, project, studio, template, user } from "../db/schema.js";
import { AppError } from "../domain/errors.js";
import { encryptWebhook, isWebhookUrl } from "../domain/discord.js";
import { newId } from "../domain/ids.js";
import { IdParam, loadProject, requireRole, type TypedApp } from "./_shared.js";

const ProjectBody = z.object({
  id: Ulid.optional(),
  name: z.string().min(1),
  folder_name: z.string().min(1).regex(/^[A-Za-z0-9._-]+$/),
  blender_version: z.string().min(1),
  ue_version: z.string().min(1),
  package_version: z.string().min(1),
});

/** The billing line. No payment code yet: a stub with the seat count only (docs/decisions.md, 2026-10-10). */
export function billingFor(training: Training, seats: number): { line: string; seats: number } {
  return { line: training === "on" ? "Nothing to pay" : "Billed per seat", seats };
}

/** A project on the wire: the webhook stays in the row. */
export function projectWire(row: typeof project.$inferSelect) {
  const { discord_webhook, ...rest } = row;
  return { ...rest, discord_configured: discord_webhook !== null };
}

export async function projectRoutes(app: TypedApp): Promise<void> {
  app.get("/studio", async (req) => {
    const rows = await app.db.select().from(studio).where(eq(studio.id, req.principal.studio_id)).limit(1);
    const row = rows[0];
    if (!row) throw new AppError("not_found", "studio not found");
    const members = await app.db.select({ id: membership.id }).from(membership).where(eq(membership.studio_id, row.id));
    return { v: 1, studio: { id: row.id, name: row.name, member_count: members.length, training: row.training, billing: billingFor(row.training, members.length) } };
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
    const rows = await app.db.select().from(project).where(eq(project.studio_id, req.principal.studio_id));
    return { v: 1, projects: rows.map(projectWire) };
  });

  app.post("/projects", { schema: { body: ProjectBody } }, async (req, reply) => {
    requireRole(req.principal, ["producer"], "creating a project");
    const id = req.body.id ?? newId();
    const existing = await app.db.select().from(project).where(eq(project.id, id)).limit(1);
    if (existing[0]) return { v: 1, project: projectWire(existing[0]) };
    const [row] = await app.db
      .insert(project)
      .values({ ...req.body, id, studio_id: req.principal.studio_id })
      .returning();
    await app.bus.audit({
      studio_id: req.principal.studio_id, project_id: id, actor_id: req.principal.user_id,
      kind: "audit.project_created", target_kind: "project", target_id: id, payload: { name: req.body.name },
    });
    return reply.status(201).send({ v: 1, project: projectWire(row!) });
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

  // Members of the studio, as the People screen and the invite sheet need them.
  app.get("/projects/:id/members", { schema: { params: IdParam } }, async (req) => {
    const proj = await loadProject(app.db, req.principal, req.params.id);
    const rows = await app.db
      .select({ id: user.id, name: user.name, avatar_url: user.avatar_url, email: user.email, roles: membership.roles })
      .from(membership)
      .innerJoin(user, eq(user.id, membership.user_id))
      .where(eq(membership.studio_id, proj.studio_id))
      .orderBy(user.name);
    return { v: 1, members: rows.map((r) => ({ user: { id: r.id, name: r.name, avatar_url: r.avatar_url }, email: r.email, roles: r.roles })) };
  });

  // Invite: a producer adds a person by email with roles. Idempotent on the email; roles replace.
  app.post(
    "/projects/:id/members",
    { schema: { params: IdParam, body: z.object({ email: z.email(), name: z.string().min(1), roles: z.array(Role).min(1) }) } },
    async (req, reply) => {
      requireRole(req.principal, ["producer"], "inviting a member");
      const proj = await loadProject(app.db, req.principal, req.params.id);
      const now = app.now();
      const email = req.body.email.toLowerCase();
      let u = (await app.db.select().from(user).where(eq(user.email, email)).limit(1))[0];
      if (u && u.studio_id !== proj.studio_id) throw new AppError("bad_request", "that email belongs to another studio");
      if (!u) [u] = await app.db.insert(user).values({ id: newId(), studio_id: proj.studio_id, email, name: req.body.name, avatar_url: null, created_at: now, updated_at: now }).returning();
      const m = (await app.db.select().from(membership).where(and(eq(membership.user_id, u!.id), eq(membership.studio_id, proj.studio_id))).limit(1))[0];
      if (m) await app.db.update(membership).set({ roles: req.body.roles, updated_at: now }).where(eq(membership.id, m.id));
      else await app.db.insert(membership).values({ id: newId(), studio_id: proj.studio_id, user_id: u!.id, roles: req.body.roles, created_at: now, updated_at: now });
      await app.bus.audit({
        studio_id: proj.studio_id, project_id: proj.id, actor_id: req.principal.user_id,
        kind: m ? "audit.roles_set" : "audit.member_invited", target_kind: "user", target_id: u!.id, payload: { email, roles: req.body.roles },
      });
      return reply.status(m ? 200 : 201).send({ v: 1, member: { user: { id: u!.id, name: u!.name, avatar_url: u!.avatar_url }, email, roles: req.body.roles } });
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
