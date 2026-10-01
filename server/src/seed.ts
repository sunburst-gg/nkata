// Seeds one studio, one project, the Character template, and the Ojukwu asset with its parts.
// Idempotent: finds by name before inserting. Run: pnpm --filter @nkata/server seed
import { and, eq } from "drizzle-orm";
import { Template, type Role } from "@nkata/shared";
import { createDb, type Db } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { asset, membership, part, project, studio, template, user } from "./db/schema.js";
import { newId } from "./domain/ids.js";
import { mappingFor } from "./routes/assets.js";

// docs/engineering.md, Templates.
export const CHARACTER_TEMPLATE: Template = {
  v: 1,
  name: "Character",
  parts: [
    { name: "concept", mapping: "file", checks: ["texture_size"] },
    { name: "face", mapping: "blend_collection", gate: [], checks: ["unit_scale", "name_pattern", "triangle_budget", "uv_set_present"], params: { triangle_budget: { max: 60000 } } },
    { name: "cloth", mapping: "blend_collection", gate: [], checks: ["unit_scale", "name_pattern", "triangle_budget"] },
    { name: "hair", mapping: "blend_collection", gate: [], checks: ["unit_scale", "name_pattern"] },
    { name: "textures", mapping: "file", gate: ["face", "cloth", "hair"], checks: ["texture_size", "name_pattern"] },
    { name: "rig", mapping: "blend_collection", gate: ["textures"], checks: ["rig_bone_names", "rig_bone_count", "metahuman_dna_present"] },
    { name: "lookdev", mapping: "ue_asset", gate: ["rig"], checks: ["lod_count", "collision_present"] },
    { name: "animation", mapping: "ue_asset", gate: ["lookdev"], checks: [] },
    { name: "sound", mapping: "file", gate: ["lookdev"], checks: [] },
  ],
  reference_slots: ["concept_sheet", "style_guide", "color_scheme"],
  export: { ue_path: "/Game/Characters/{asset}/{part}", name: "SK_{asset}_{part}" },
  blend_layout: "one_file_per_part",
};

export const SEED_USERS: { email: string; name: string; roles: Role[] }[] = [
  { email: "artist@sunburst.gg", name: "Rising Sun artist", roles: ["artist"] },
  { email: "director@sunburst.gg", name: "Art director", roles: ["artist", "art_director"] },
  { email: "engineer@sunburst.gg", name: "Engineer", roles: ["engineer"] },
  { email: "producer@sunburst.gg", name: "Producer", roles: ["producer"] },
];

export type Seeded = { studio_id: string; project_id: string; template_id: string; asset_id: string; users: Record<string, string> };

export async function seed(db: Db): Promise<Seeded> {
  const now = new Date();
  let st = (await db.select().from(studio).where(eq(studio.name, "Sunburst Interactive")).limit(1))[0];
  if (!st) [st] = await db.insert(studio).values({ id: newId(), name: "Sunburst Interactive", created_at: now, updated_at: now }).returning();
  const studioId = st!.id;

  const users: Record<string, string> = {};
  for (const u of SEED_USERS) {
    let row = (await db.select().from(user).where(eq(user.email, u.email)).limit(1))[0];
    if (!row) [row] = await db.insert(user).values({ id: newId(), studio_id: studioId, email: u.email, name: u.name, avatar_url: null, created_at: now, updated_at: now }).returning();
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

  let tpl = (await db.select().from(template).where(and(eq(template.project_id, projectId), eq(template.name, "Character"))).limit(1))[0];
  if (!tpl) {
    [tpl] = await db
      .insert(template)
      .values({ id: newId(), studio_id: studioId, project_id: projectId, name: "Character", file_path: ".nkata/templates/Character.json", schema: CHARACTER_TEMPLATE, created_at: now, updated_at: now })
      .returning();
  }

  let oj = (await db.select().from(asset).where(and(eq(asset.project_id, projectId), eq(asset.name, "Ojukwu"))).limit(1))[0];
  if (!oj) {
    [oj] = await db.insert(asset).values({ id: newId(), studio_id: studioId, project_id: projectId, template_id: tpl!.id, name: "Ojukwu", reference_files: [], created_at: now, updated_at: now }).returning();
    const artist = users["artist@sunburst.gg"]!;
    const engineer = users["engineer@sunburst.gg"]!;
    await db.insert(part).values(
      CHARACTER_TEMPLATE.parts.map((tp, position) => ({
        id: newId(), studio_id: studioId, asset_id: oj!.id, name: tp.name, position,
        owner_id: tp.mapping === "ue_asset" ? engineer : artist,
        state: (tp.gate ?? []).length > 0 ? ("locked" as const) : ("draft" as const),
        gate: { after: tp.gate ?? [] }, mapping: mappingFor(CHARACTER_TEMPLATE, tp, "Ojukwu"), created_at: now, updated_at: now,
      })),
    );
  }
  return { studio_id: studioId, project_id: projectId, template_id: tpl!.id, asset_id: oj!.id, users };
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
