// Seeds one studio, one project, the Character, Environment prop, and Level area templates,
// the Ojukwu character, three props, and one level area.
// Idempotent: finds by name before inserting. Run: pnpm --filter @nkata/server seed
import { and, eq } from "drizzle-orm";
import type { Role } from "@nkata/shared";
import { createDb, type Db } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { asset, membership, part, project, studio, template, user } from "./db/schema.js";
import { newId } from "./domain/ids.js";
import { mappingFor } from "./routes/assets.js";
import { TEMPLATES, templateFilePath, type Template } from "./domain/templates.js";

export const SEED_USERS: { email: string; name: string; roles: Role[] }[] = [
  { email: "artist@sunburst.gg", name: "Rising Sun artist", roles: ["artist"] },
  { email: "env@sunburst.gg", name: "Environment artist", roles: ["artist"] },
  { email: "director@sunburst.gg", name: "Art director", roles: ["artist", "art_director"] },
  { email: "producer@sunburst.gg", name: "Producer", roles: ["producer"] },
  { email: "viewer@sunburst.gg", name: "Publisher", roles: ["viewer"] },
];

/** The seeded assets: name, template, owner of every part. */
export const SEED_ASSETS: { name: string; template: string; owner: string }[] = [
  { name: "Ojukwu", template: "Character", owner: "artist@sunburst.gg" },
  { name: "Kettle", template: "Environment prop", owner: "env@sunburst.gg" },
  { name: "Wooden stool", template: "Environment prop", owner: "env@sunburst.gg" },
  { name: "Market stall", template: "Environment prop", owner: "env@sunburst.gg" },
  { name: "Enugu Market / square", template: "Level area", owner: "env@sunburst.gg" },
];

export type Seeded = { studio_id: string; project_id: string; template_id: string; asset_id: string; assets: Record<string, string>; users: Record<string, string> };

export async function seed(db: Db): Promise<Seeded> {
  const now = new Date();
  let st = (await db.select().from(studio).where(eq(studio.name, "Sunburst Interactive")).limit(1))[0];
  if (!st) [st] = await db.insert(studio).values({ id: newId(), name: "Sunburst Interactive", created_at: now, updated_at: now }).returning();
  const studioId = st!.id;

  const users: Record<string, string> = {};
  for (const u of SEED_USERS) {
    let row = (await db.select().from(user).where(eq(user.email, u.email)).limit(1))[0];
    if (!row) [row] = await db.insert(user).values({ id: newId(), email: u.email, name: u.name, avatar_url: null, created_at: now, updated_at: now }).returning();
    const m = (await db.select().from(membership).where(and(eq(membership.user_id, row!.id), eq(membership.studio_id, studioId))).limit(1))[0];
    if (!m) await db.insert(membership).values({ id: newId(), studio_id: studioId, user_id: row!.id, roles: u.roles, created_at: now, updated_at: now });
    users[u.email] = row!.id;
  }

  let proj = (await db.select().from(project).where(and(eq(project.studio_id, studioId), eq(project.name, "Rising Sun"))).limit(1))[0];
  if (!proj) {
    [proj] = await db
      .insert(project)
      .values({ id: newId(), studio_id: studioId, name: "Rising Sun", folder_name: "rising-sun", blender_version: "4.2", ue_version: "5.4", package_version: "0.1.0", created_at: now, updated_at: now })
      .returning();
  }
  const projectId = proj!.id;

  const templates: Record<string, { id: string; schema: Template }> = {};
  for (const schema of TEMPLATES) {
    let tpl = (await db.select().from(template).where(and(eq(template.project_id, projectId), eq(template.name, schema.name))).limit(1))[0];
    if (!tpl) {
      [tpl] = await db
        .insert(template)
        .values({ id: newId(), studio_id: studioId, project_id: projectId, name: schema.name, file_path: templateFilePath(schema.name), schema, created_at: now, updated_at: now })
        .returning();
    }
    templates[schema.name] = { id: tpl!.id, schema };
  }

  const assets: Record<string, string> = {};
  for (const sa of SEED_ASSETS) {
    const tpl = templates[sa.template]!;
    let row = (await db.select().from(asset).where(and(eq(asset.project_id, projectId), eq(asset.name, sa.name))).limit(1))[0];
    if (!row) {
      [row] = await db.insert(asset).values({ id: newId(), studio_id: studioId, project_id: projectId, template_id: tpl.id, name: sa.name, reference_files: [], kind: tpl.schema.kind === "level_area" ? "environment" : "object", created_at: now, updated_at: now }).returning();
      await db.insert(part).values(
        tpl.schema.parts.map((tp, position) => ({
          id: newId(), studio_id: studioId, asset_id: row!.id, name: tp.name, position,
          owner_id: users[sa.owner]!,
          state: (tp.gate ?? []).length > 0 ? ("locked" as const) : ("draft" as const),
          gate: { after: tp.gate ?? [] }, mapping: mappingFor(tpl.schema, tp, sa.name), created_at: now, updated_at: now,
        })),
      );
    }
    assets[sa.name] = row!.id;
  }
  return { studio_id: studioId, project_id: projectId, template_id: templates["Character"]!.id, asset_id: assets["Ojukwu"]!, assets, users };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set");
  const { db, pool } = createDb(url);
  await runMigrations(db);
  const out = await seed(db);
  await pool.end();
  process.stdout.write(`${JSON.stringify(out)}\n`);
}
