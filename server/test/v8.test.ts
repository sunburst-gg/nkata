// v8 step 11: the wall's nouns on the existing rows (migration 0010). asset.kind from the template,
// asset.group as the wall's section, asset.budget as a lead's override, project.budgets with the
// Decisions 12 defaults. Nothing dropped; old columns stay readable.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasInfra, startHarness, type Harness } from "./helpers.js";

const ENV = "env@sunburst.gg";
const AD = "director@sunburst.gg";
const PRODUCER = "producer@sunburst.gg";
const VIEWER = "viewer@sunburst.gg";
const DEFAULTS = { prop: 30000, vehicle: 60000, character: 80000, environment: 2000000, max_texture: null };

type AssetRow = { id: string; name: string; kind: string; group: string | null; budget: number | null; folder: string };

describe.skipIf(!hasInfra)("v8 assets and budgets", () => {
  let h: Harness;
  beforeAll(async () => { h = await startHarness(); });
  afterAll(async () => h?.close());

  const list = async (): Promise<AssetRow[]> => (await h.app.inject({ method: "GET", url: `/assets?project_id=${h.seeded.project_id}`, ...h.as(ENV) })).json().assets as AssetRow[];

  it("seeds every asset with a kind from its template, no group, no override", async () => {
    const assets = await list();
    expect(assets.find((a) => a.name === "Enugu Market / square")?.kind).toBe("environment");
    for (const a of assets.filter((x) => x.name !== "Enugu Market / square")) expect(a.kind, a.name).toBe("object");
    expect(assets.every((a) => a.group === null && a.budget === null)).toBe(true);
  });

  it("a project starts with the default budgets; a lead changes them, an artist and a viewer cannot", async () => {
    const got = await h.app.inject({ method: "GET", url: `/projects/${h.seeded.project_id}/budgets`, ...h.as(VIEWER) });
    expect(got.statusCode).toBe(200);
    expect(got.json().budgets).toEqual(DEFAULTS);
    const next = { ...DEFAULTS, prop: 50000, max_texture: 2048 };
    expect((await h.app.inject({ method: "PUT", url: `/projects/${h.seeded.project_id}/budgets`, payload: next, ...h.as(ENV) })).statusCode).toBe(403);
    expect((await h.app.inject({ method: "PUT", url: `/projects/${h.seeded.project_id}/budgets`, payload: next, ...h.as(VIEWER) })).statusCode).toBe(403);
    const set = await h.app.inject({ method: "PUT", url: `/projects/${h.seeded.project_id}/budgets`, payload: next, ...h.as(AD) });
    expect(set.statusCode).toBe(200);
    expect(set.json().budgets).toEqual(next);
    expect((await h.app.inject({ method: "GET", url: `/projects/${h.seeded.project_id}/budgets`, ...h.as(ENV) })).json().budgets).toEqual(next);
    const bad = await h.app.inject({ method: "PUT", url: `/projects/${h.seeded.project_id}/budgets`, payload: { ...next, prop: 0 }, ...h.as(PRODUCER) });
    expect(bad.statusCode).toBe(400);
  });

  it("group and budget update on an asset; only a lead sets the budget; folder keeps working", async () => {
    const kettle = (await list()).find((a) => a.name === "Kettle")!;
    const grouped = await h.app.inject({ method: "PUT", url: `/assets/${kettle.id}`, payload: { group: "Props" }, ...h.as(ENV) });
    expect(grouped.statusCode).toBe(200);
    expect(grouped.json().asset).toMatchObject({ group: "Props", budget: null, folder: "" });
    expect((await h.app.inject({ method: "PUT", url: `/assets/${kettle.id}`, payload: { budget: 45000 }, ...h.as(ENV) })).statusCode).toBe(403);
    const over = await h.app.inject({ method: "PUT", url: `/assets/${kettle.id}`, payload: { budget: 45000 }, ...h.as(PRODUCER) });
    expect(over.json().asset).toMatchObject({ group: "Props", budget: 45000 });
    const cleared = await h.app.inject({ method: "PUT", url: `/assets/${kettle.id}`, payload: { budget: null, group: null }, ...h.as(AD) });
    expect(cleared.json().asset).toMatchObject({ group: null, budget: null });
    const moved = await h.app.inject({ method: "PUT", url: `/assets/${kettle.id}`, payload: { folder: "Kitchen" }, ...h.as(ENV) });
    expect(moved.json().asset.folder).toBe("Kitchen");
    expect((await h.app.inject({ method: "PUT", url: `/assets/${kettle.id}`, payload: { group: "a/b" }, ...h.as(ENV) })).statusCode).toBe(400);
  });

  it("a project keeps the swatch it was made with, and a rename keeps it too", async () => {
    const made = await h.app.inject({ method: "POST", url: "/projects", payload: { name: "Harmattan", folder_name: "harmattan", blender_version: "4.2", ue_version: "5.4", package_version: "0.1.0", color: "var(--p-teal)" }, ...h.as(PRODUCER) });
    expect(made.statusCode).toBe(201);
    const id = made.json().project.id as string;
    expect(made.json().project.color).toBe("var(--p-teal)");
    const renamed = await h.app.inject({ method: "PUT", url: `/projects/${id}`, payload: { name: "Harmattan 2" }, ...h.as(PRODUCER) });
    expect(renamed.json().project).toMatchObject({ name: "Harmattan 2", color: "var(--p-teal)" });
    const recolored = await h.app.inject({ method: "PUT", url: `/projects/${id}`, payload: { color: "var(--p-plum)" }, ...h.as(PRODUCER) });
    expect(recolored.json().project).toMatchObject({ name: "Harmattan 2", color: "var(--p-plum)" });
    expect((await h.app.inject({ method: "PUT", url: `/projects/${id}`, payload: { color: "#ff0000" }, ...h.as(PRODUCER) })).statusCode).toBe(400);
    expect((await h.app.inject({ method: "GET", url: `/projects/${h.seeded.project_id}/budgets`, ...h.as(PRODUCER) })).statusCode).toBe(200);
  });

  it("an artist makes an asset of their own from a saved .blend; not one for someone else; a viewer never", async () => {
    const me = h.seeded.users[ENV]!;
    const mine = await h.app.inject({ method: "POST", url: "/assets", payload: { project_id: h.seeded.project_id, template_name: "Object", name: "Radio", parts: ["model"], owners: { model: me }, files: { model: "Props/Radio/Radio.blend" }, group: "Props" }, ...h.as(ENV) });
    expect(mine.statusCode).toBe(201);
    expect(mine.json().asset).toMatchObject({ kind: "object", group: "Props" });
    expect(mine.json().parts.map((p: { name: string; owner_id: string }) => [p.name, p.owner_id])).toEqual([["model", me]]);
    const theirs = await h.app.inject({ method: "POST", url: "/assets", payload: { project_id: h.seeded.project_id, template_name: "Object", name: "Lamp", parts: ["model"], owners: { model: h.seeded.users[AD]! }, files: { model: "Props/Lamp/Lamp.blend" } }, ...h.as(ENV) });
    expect(theirs.statusCode).toBe(403);
    const nobody = await h.app.inject({ method: "POST", url: "/assets", payload: { project_id: h.seeded.project_id, template_name: "Object", name: "Lamp", parts: ["model"] }, ...h.as(ENV) });
    expect(nobody.statusCode).toBe(403);
    const viewer = await h.app.inject({ method: "POST", url: "/assets", payload: { project_id: h.seeded.project_id, template_name: "Object", name: "Vase", parts: ["model"], owners: { model: h.seeded.users[VIEWER]! } }, ...h.as(VIEWER) });
    expect(viewer.statusCode).toBe(403);
    const env = await h.app.inject({ method: "POST", url: "/assets", payload: { project_id: h.seeded.project_id, template_name: "Environment", name: "Market", parts: ["model"], owners: { model: me }, files: { model: "Environments/Market/Market.blend" }, group: "Environments" }, ...h.as(ENV) });
    expect(env.statusCode).toBe(201);
    expect(env.json().asset).toMatchObject({ kind: "environment", group: "Environments" });
  });

  it("a new asset takes its kind from the template and its group from the body", async () => {
    const made = await h.app.inject({ method: "POST", url: "/assets", payload: { project_id: h.seeded.project_id, template_name: "Environment prop", name: "Lantern", group: "Props" }, ...h.as(AD) });
    expect(made.statusCode).toBe(201);
    expect(made.json().asset).toMatchObject({ kind: "object", group: "Props", budget: null });
    const area = await h.app.inject({ method: "POST", url: "/assets", payload: { project_id: h.seeded.project_id, template_name: "Level area", name: "Harbour / docks" }, ...h.as(PRODUCER) });
    expect(area.statusCode).toBe(201);
    expect(area.json().asset).toMatchObject({ kind: "environment", group: null });
  });
});
