import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { Template, Ulid } from "@nkata/shared";
import { project, template } from "../db/schema.js";
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

export async function projectRoutes(app: TypedApp): Promise<void> {
  app.get("/projects", async (req) => {
    const rows = await app.db.select().from(project).where(eq(project.studio_id, req.principal.studio_id));
    return { v: 1, projects: rows };
  });

  app.post("/projects", { schema: { body: ProjectBody } }, async (req, reply) => {
    requireRole(req.principal, ["producer"], "creating a project");
    const id = req.body.id ?? newId();
    const existing = await app.db.select().from(project).where(eq(project.id, id)).limit(1);
    if (existing[0]) return { v: 1, project: existing[0] };
    const [row] = await app.db
      .insert(project)
      .values({ ...req.body, id, studio_id: req.principal.studio_id })
      .returning();
    await app.bus.audit({
      studio_id: req.principal.studio_id, project_id: id, actor_id: req.principal.user_id,
      kind: "audit.project_created", target_kind: "project", target_id: id, payload: { name: req.body.name },
    });
    return reply.status(201).send({ v: 1, project: row });
  });

  app.get("/projects/:id", { schema: { params: IdParam } }, async (req) => {
    return { v: 1, project: await loadProject(app.db, req.principal, req.params.id) };
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
}
