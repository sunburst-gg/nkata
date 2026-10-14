import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasInfra, startHarness, type Harness } from "./helpers.js";

const ARTIST = "artist@sunburst.gg";
const AD = "director@sunburst.gg";
const PRODUCER = "producer@sunburst.gg";
const ENV = "env@sunburst.gg";
const VIEWER = "viewer@sunburst.gg";

describe.skipIf(!hasInfra)("server api", () => {
  let h: Harness;
  let parts: Record<string, string>;
  beforeAll(async () => {
    h = await startHarness();
    const res = await h.app.inject({ method: "GET", url: `/assets/${h.seeded.asset_id}`, ...h.as(ARTIST) });
    parts = Object.fromEntries((res.json() as { parts: { name: string; id: string }[] }).parts.map((p) => [p.name, p.id]));
  });
  afterAll(async () => h?.close());

  it("answers the desktop window's preflight and ignores other origins", async () => {
    const pre = await h.app.inject({ method: "OPTIONS", url: "/auth/magic-link", headers: { origin: "tauri://localhost", "access-control-request-method": "POST", "access-control-request-headers": "content-type" } });
    expect(pre.statusCode).toBe(204);
    expect(pre.headers["access-control-allow-origin"]).toBe("tauri://localhost");
    expect(String(pre.headers["access-control-allow-headers"])).toContain("content-type");
    const dev = await h.app.inject({ method: "GET", url: "/projects", headers: { origin: "http://localhost:1420", ...h.as(ARTIST).headers } });
    expect(dev.headers["access-control-allow-origin"]).toBe("http://localhost:1420");
    const other = await h.app.inject({ method: "GET", url: "/health", headers: { origin: "https://evil.example" } });
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rejects requests without a session", async () => {
    const res = await h.app.inject({ method: "GET", url: "/projects" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ v: 1, error: { code: "unauthorized", message: "missing bearer token" } });
  });

  it("magic link is single use", async () => {
    const link = await h.app.inject({ method: "POST", url: "/auth/magic-link", payload: { email: ARTIST } });
    const token = new URL((link.json() as { link: string }).link).searchParams.get("token")!;
    expect((await h.app.inject({ method: "POST", url: "/auth/callback", payload: { token } })).statusCode).toBe(200);
    expect((await h.app.inject({ method: "POST", url: "/auth/callback", payload: { token } })).statusCode).toBe(401);
  });

  it("emails a six digit code that signs in, five tries, then a new one", async () => {
    const before = h.mailed.length;
    const res = (await h.app.inject({ method: "POST", url: "/auth/magic-link", payload: { email: ARTIST } })).json() as { sent: boolean; code: string; link: string };
    expect(res.code).toMatch(/^\d{6}$/);
    const sent = h.mailed.slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: ARTIST, subject: `${res.code} is your Nkata code` });
    expect(sent[0]!.html).toContain(res.code);
    expect(sent[0]!.html).toContain("15 minutes");
    expect(sent[0]!.text).toContain(res.code);
    expect((await h.app.inject({ method: "POST", url: "/auth/code", payload: { email: ARTIST, code: "12345" } })).statusCode).toBe(400);
    const wrong = String((Number(res.code) + 1) % 1_000_000).padStart(6, "0");
    for (let i = 0; i < 5; i++) expect((await h.app.inject({ method: "POST", url: "/auth/code", payload: { email: ARTIST, code: wrong } })).statusCode).toBe(401);
    // Five wrong tries kill the code, even the right one.
    expect((await h.app.inject({ method: "POST", url: "/auth/code", payload: { email: ARTIST, code: res.code } })).statusCode).toBe(401);
    const fresh = (await h.app.inject({ method: "POST", url: "/auth/magic-link", payload: { email: ARTIST } })).json() as { code: string };
    const signed = await h.app.inject({ method: "POST", url: "/auth/code", payload: { email: ARTIST.toUpperCase(), code: fresh.code } });
    expect(signed.statusCode).toBe(200);
    expect((signed.json() as { studio_id: string; roles: string[] })).toMatchObject({ studio_id: h.seeded.studio_id, roles: ["artist"] });
    // A code is single use, and an unknown email is as wrong as a wrong code.
    expect((await h.app.inject({ method: "POST", url: "/auth/code", payload: { email: ARTIST, code: fresh.code } })).statusCode).toBe(401);
    expect((await h.app.inject({ method: "POST", url: "/auth/code", payload: { email: "ghost@example.com", code: "000000" } })).statusCode).toBe(401);
  });

  it("in dev mode a mail failure still hands the code back", async () => {
    const real = h.app.mailer.send;
    h.app.mailer.send = async () => { throw new Error("the mail service answered 403: domain not verified"); };
    try {
      const res = await h.app.inject({ method: "POST", url: "/auth/magic-link", payload: { email: ARTIST } });
      expect(res.statusCode).toBe(200);
      expect((res.json() as { code: string }).code).toMatch(/^\d{6}$/);
    } finally {
      h.app.mailer.send = real;
    }
  });

  it("signs up an unknown email: no name, no studio, then Create studio makes a producer", async () => {
    const link = await h.app.inject({ method: "POST", url: "/auth/magic-link", payload: { email: "Nobody@Example.com" } });
    const token = new URL((link.json() as { link: string }).link).searchParams.get("token")!;
    const session = (await h.app.inject({ method: "POST", url: "/auth/callback", payload: { token } })).json() as { token: string; user: { name: string }; email: string; studio_id: string | null; roles: string[]; studios: unknown[] };
    expect(session).toMatchObject({ user: { name: "" }, email: "nobody@example.com", studio_id: null, roles: [], studios: [] });
    const as = { headers: { authorization: `Bearer ${session.token}` } };
    // Nothing of a studio until there is one.
    const refused = await h.app.inject({ method: "GET", url: "/projects", ...as });
    expect(refused.statusCode).toBe(403);
    expect((refused.json() as { error: { code_hint: string } }).error.code_hint).toBe("no_studio");
    expect((await h.app.inject({ method: "GET", url: "/auth/me", ...as })).statusCode).toBe(200);
    // Name, then the studio.
    const named = await h.app.inject({ method: "PUT", url: "/me", ...as, payload: { name: "Emmanuel Njoku" } });
    expect((named.json() as { user: { name: string } }).user.name).toBe("Emmanuel Njoku");
    const taken = await h.app.inject({ method: "PUT", url: "/me", ...as, payload: { name: "Emmanuel Njoku", email: ARTIST } });
    expect(taken.statusCode).toBe(409);
    const made = await h.app.inject({ method: "POST", url: "/studios", ...as, payload: { name: "Sunburst" } });
    expect(made.statusCode).toBe(201);
    const inside = made.json() as { token: string; studio_id: string; roles: string[]; studios: { name: string }[] };
    expect(inside.roles).toEqual(["producer"]);
    expect(inside.studios.map((x) => x.name)).toEqual(["Sunburst"]);
    const mine = { headers: { authorization: `Bearer ${inside.token}` } };
    // Unreal is Coming soon: the one flag the app, the agent, and the add-on read.
    expect(((await h.app.inject({ method: "GET", url: "/auth/me", ...mine })).json() as { features: { unreal: boolean } }).features).toEqual({ unreal: false });
    const studio = (await h.app.inject({ method: "GET", url: "/studio", ...mine })).json() as { studio: { name: string; training: string; billing: { line: string } } };
    // A new studio starts with training off and pays nothing while Nkata is in testing.
    expect(studio.studio).toMatchObject({ name: "Sunburst", training: "off", billing: { line: "Free while Nkata is in testing" } });
    expect((await h.app.inject({ method: "GET", url: "/projects", ...mine })).json()).toEqual({ v: 1, projects: [] });
    // The old session still has no studio; a switch issues one inside it.
    const switched = await h.app.inject({ method: "POST", url: "/auth/switch", ...as, payload: { studio_id: inside.studio_id } });
    expect((switched.json() as { studio_id: string }).studio_id).toBe(inside.studio_id);
    expect((await h.app.inject({ method: "POST", url: "/auth/switch", ...as, payload: { studio_id: h.seeded.studio_id } })).statusCode).toBe(404);
    // Renaming the studio, and the last producer stays.
    expect(((await h.app.inject({ method: "PUT", url: "/studio", ...mine, payload: { name: "Sunburst Games" } })).json() as { studio: { name: string } }).studio.name).toBe("Sunburst Games");
    const meId = ((await h.app.inject({ method: "GET", url: "/auth/me", ...mine })).json() as { user: { id: string } }).user.id;
    expect((await h.app.inject({ method: "DELETE", url: `/studio/members/${meId}`, ...mine })).statusCode).toBe(409);
    expect((await h.app.inject({ method: "PUT", url: `/studio/members/${meId}`, ...mine, payload: { roles: ["artist"] } })).statusCode).toBe(409);
  });

  it("one account joins many studios, and a producer manages the members", async () => {
    // The seeded artist is invited to a second studio by its producer.
    const link = await h.app.inject({ method: "POST", url: "/auth/magic-link", payload: { email: "owner@lagosinteractive.com" } });
    const token = new URL((link.json() as { link: string }).link).searchParams.get("token")!;
    const fresh = (await h.app.inject({ method: "POST", url: "/auth/callback", payload: { token } })).json() as { token: string };
    const made = (await h.app.inject({ method: "POST", url: "/studios", headers: { authorization: `Bearer ${fresh.token}` }, payload: { name: "Lagos Interactive" } })).json() as { token: string; studio_id: string };
    const owner = { headers: { authorization: `Bearer ${made.token}` } };
    const before = h.mailed.length;
    const invited = await h.app.inject({ method: "POST", url: "/studio/members", ...owner, payload: { email: ARTIST, roles: ["art_director"] } });
    expect(invited.statusCode).toBe(201);
    // The studio invite email went out once; a roles change later sends nothing.
    const mail = h.mailed.slice(before);
    expect(mail).toHaveLength(1);
    expect(mail[0]).toMatchObject({ to: ARTIST, subject: "owner added you to Lagos Interactive on Nkata" });
    expect(mail[0]!.html).toContain("Join Lagos Interactive");
    expect(mail[0]!.html).toContain("Art director");
    expect((await h.app.inject({ method: "GET", url: `/join?email=${encodeURIComponent(ARTIST)}` })).statusCode).toBe(200);
    const members = (await h.app.inject({ method: "GET", url: "/studio/members", ...owner })).json() as { members: { email: string; roles: string[] }[] };
    expect(members.members.map((m) => [m.email, m.roles])).toEqual(expect.arrayContaining([[ARTIST, ["art_director"]], ["owner@lagosinteractive.com", ["producer"]]]));
    // The artist now has two studios and can switch into the new one.
    const me = (await h.app.inject({ method: "GET", url: "/auth/me", ...h.as(ARTIST) })).json() as { studio_id: string; studios: { id: string; name: string; roles: string[] }[] };
    expect(me.studio_id).toBe(h.seeded.studio_id);
    expect(me.studios.map((s) => s.name).sort()).toEqual(["Lagos Interactive", "Sunburst Interactive"]);
    const switched = (await h.app.inject({ method: "POST", url: "/auth/switch", ...h.as(ARTIST), payload: { studio_id: made.studio_id } })).json() as { token: string; roles: string[] };
    expect(switched.roles).toEqual(["art_director"]);
    const there = (await h.app.inject({ method: "GET", url: "/studio", headers: { authorization: `Bearer ${switched.token}` } })).json() as { studio: { name: string } };
    expect(there.studio.name).toBe("Lagos Interactive");
    // Roles change and removal, by the producer only.
    const artistId = members.members.find((m) => m.email === ARTIST) ? ((await h.app.inject({ method: "GET", url: "/auth/me", ...h.as(ARTIST) })).json() as { user: { id: string } }).user.id : "";
    expect((await h.app.inject({ method: "PUT", url: `/studio/members/${artistId}`, headers: { authorization: `Bearer ${switched.token}` }, payload: { roles: ["artist"] } })).statusCode).toBe(403);
    expect((await h.app.inject({ method: "PUT", url: `/studio/members/${artistId}`, ...owner, payload: { roles: ["artist"] } })).statusCode).toBe(200);
    expect((await h.app.inject({ method: "DELETE", url: `/studio/members/${artistId}`, ...owner })).statusCode).toBe(200);
    expect((await h.app.inject({ method: "GET", url: "/studio", headers: { authorization: `Bearer ${switched.token}` } })).statusCode).toBe(401);
    expect(((await h.app.inject({ method: "GET", url: "/auth/me", ...h.as(ARTIST) })).json() as { studios: unknown[] }).studios).toHaveLength(1);
  });

  it("renames and deletes a project; the rows stay and the lists forget it", async () => {
    const made = (await h.app.inject({ method: "POST", url: "/projects", ...h.as(PRODUCER), payload: { name: "Side", folder_name: "side", blender_version: "4.2", ue_version: "5.4", package_version: "0.1.0" } })).json() as { project: { id: string } };
    expect((await h.app.inject({ method: "PUT", url: `/projects/${made.project.id}`, ...h.as(ARTIST), payload: { name: "Side B" } })).statusCode).toBe(403);
    const renamed = (await h.app.inject({ method: "PUT", url: `/projects/${made.project.id}`, ...h.as(PRODUCER), payload: { name: "Side B" } })).json() as { project: { name: string } };
    expect(renamed.project.name).toBe("Side B");
    expect((await h.app.inject({ method: "DELETE", url: `/projects/${made.project.id}`, ...h.as(PRODUCER) })).json()).toEqual({ v: 1, deleted: true });
    const list = (await h.app.inject({ method: "GET", url: "/projects", ...h.as(ARTIST) })).json() as { projects: { id: string }[] };
    expect(list.projects.map((p) => p.id)).not.toContain(made.project.id);
    expect((await h.app.inject({ method: "GET", url: `/projects/${made.project.id}`, ...h.as(PRODUCER) })).statusCode).toBe(404);
    // Restore brings it back with everything it had.
    const deleted = (await h.app.inject({ method: "GET", url: "/projects/deleted", ...h.as(PRODUCER) })).json() as { projects: { id: string; name: string; deleted_at: string }[] };
    expect(deleted.projects.map((p) => p.name)).toEqual(["Side B"]);
    expect((await h.app.inject({ method: "GET", url: "/projects/deleted", ...h.as(ARTIST) })).statusCode).toBe(403);
    expect((await h.app.inject({ method: "POST", url: `/projects/${made.project.id}/restore`, ...h.as(PRODUCER) })).statusCode).toBe(200);
    expect((await h.app.inject({ method: "GET", url: `/projects/${made.project.id}`, ...h.as(PRODUCER) })).statusCode).toBe(200);
    expect((await h.app.inject({ method: "POST", url: `/projects/${made.project.id}/restore`, ...h.as(PRODUCER) })).statusCode).toBe(404);
  });

  it("seeds the Ojukwu asset with gated parts locked", async () => {
    const res = await h.app.inject({ method: "GET", url: `/assets/${h.seeded.asset_id}`, ...h.as(ARTIST) });
    const body = res.json() as { asset: { state: string }; parts: { name: string; state: string; kind: string; mapping: { kind: string }; checks: unknown; waiting_on: string[]; reference_files: string[] }[] };
    expect(body.parts.map((p) => p.name)).toEqual(["concept", "face", "cloth", "hair", "textures", "rig", "lookdev"]);
    expect(body.parts.find((p) => p.name === "textures")?.state).toBe("locked");
    expect(body.parts.find((p) => p.name === "face")?.state).toBe("draft");
    expect(body.parts.find((p) => p.name === "lookdev")?.mapping).toEqual({ kind: "ue_asset", path: "/Game/Characters/Ojukwu/lookdev" });
    expect(new Set(body.parts.map((p) => p.kind))).toEqual(new Set(["character"]));
    const face = body.parts.find((p) => p.name === "face")!;
    expect(face.checks).toEqual([
      { id: "texture_names", severity: "block", params: { pattern: "T_.*" } },
      { id: "unit_scale", severity: "block", params: {} },
      { id: "uv_set_present", severity: "block", params: {} },
      { id: "triangle_budget", severity: "block", params: { max: 60000 } },
      { id: "name_pattern", severity: "warn", params: { pattern: "SK_.*" } },
    ]);
    expect(face.waiting_on).toEqual([]);
    expect(face.reference_files).toEqual([]);
    expect(body.parts.find((p) => p.name === "textures")?.waiting_on).toEqual(["face", "cloth", "hair"]);
    expect(body.parts.find((p) => p.name === "concept")?.checks).toEqual([{ id: "texture_size", severity: "warn", params: {} }]);
    expect(body.asset.state).toBe("draft");
  });

  it("seeds three props and one level area for the environment artist", async () => {
    const res = await h.app.inject({ method: "GET", url: `/assets?project_id=${h.seeded.project_id}`, ...h.as(ARTIST) });
    const names = (res.json() as { assets: { name: string }[] }).assets.map((a) => a.name).sort();
    expect(names).toEqual(["Enugu Market / square", "Kettle", "Market stall", "Ojukwu", "Wooden stool"]);
    const kettle = await h.app.inject({ method: "GET", url: `/assets/${h.seeded.assets["Kettle"]}`, ...h.as(ARTIST) });
    const kettleParts = (kettle.json() as { parts: { name: string; kind: string; state: string; mapping: unknown }[] }).parts;
    expect(kettleParts.map((p) => p.name)).toEqual(["concept", "model", "uvs", "textures", "lods", "collision"]);
    expect(kettleParts.find((p) => p.name === "lods")?.mapping).toEqual({ kind: "ue_asset", path: "/Game/Props/Kettle" });
    const square = await h.app.inject({ method: "GET", url: `/assets/${h.seeded.assets["Enugu Market / square"]}`, ...h.as(ARTIST) });
    const squareParts = (square.json() as { parts: { name: string; state: string; kind: string; mapping: unknown }[] }).parts;
    expect(squareParts.map((p) => p.name)).toEqual(["blockout", "layout", "set_dressing", "lighting"]);
    expect(squareParts[0]?.kind).toBe("level_area");
    expect(kettleParts[0]?.kind).toBe("prop");
    expect(squareParts[0]?.mapping).toEqual({ kind: "ue_area", level: "Enugu Market", area: "square" });
    expect(squareParts.map((p) => p.state)).toEqual(["draft", "draft", "draft", "draft"]);
    expect(kettleParts.every((p) => p.state === "draft")).toBe(true);
  });

  it("finds parts by open file", async () => {
    const res = await h.app.inject({ method: "GET", url: `/parts?project_id=${h.seeded.project_id}&file=${encodeURIComponent("Ojukwu/face.blend")}`, ...h.as(ARTIST) });
    expect((res.json() as { parts: { name: string }[] }).parts.map((p) => p.name)).toEqual(["face"]);
  });

  it("only producers create projects, and creation is idempotent by id", async () => {
    const body = { id: "01J9ZZZZZZZZZZZZZZZZZZZZZZ", name: "Side", folder_name: "side", blender_version: "4.2", ue_version: "5.4", package_version: "0.1.0" };
    expect((await h.app.inject({ method: "POST", url: "/projects", payload: body, ...h.as(ARTIST) })).statusCode).toBe(403);
    expect((await h.app.inject({ method: "POST", url: "/projects", payload: body, ...h.as(PRODUCER) })).statusCode).toBe(201);
    expect((await h.app.inject({ method: "POST", url: "/projects", payload: body, ...h.as(PRODUCER) })).statusCode).toBe(200);
  });

  it("creates an asset from a template with owners", async () => {
    const res = await h.app.inject({
      method: "POST", url: "/assets", ...h.as(AD),
      payload: { project_id: h.seeded.project_id, template_name: "Character", name: "Amadi", owners: { face: h.seeded.users[ARTIST] } },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { parts: { name: string; owner_id: string | null; state: string }[] };
    expect(body.parts).toHaveLength(7);
    expect(body.parts.find((p) => p.name === "face")?.owner_id).toBe(h.seeded.users[ARTIST]);
    expect(body.parts.find((p) => p.name === "rig")?.state).toBe("locked");
    const bad = await h.app.inject({ method: "POST", url: "/assets", ...h.as(AD), payload: { project_id: h.seeded.project_id, template_name: "Character", name: "Bad", owners: { nope: h.seeded.users[ARTIST] } } });
    expect(bad.statusCode).toBe(400);
  });

  it("a new project starts with the three standard templates", async () => {
    const made = (await h.app.inject({ method: "POST", url: "/projects", ...h.as(PRODUCER), payload: { name: "Fresh", folder_name: "fresh", blender_version: "4.2", ue_version: "5.4", package_version: "0.1.0" } })).json() as { project: { id: string } };
    const res = (await h.app.inject({ method: "GET", url: `/projects/${made.project.id}/templates`, ...h.as(ARTIST) })).json() as { templates: { name: string; file_path: string }[] };
    expect(res.templates.map((tp) => tp.name).sort()).toEqual(["Character", "Environment prop", "Level area"]);
    expect(res.templates.find((tp) => tp.name === "Character")?.file_path).toBe(".nkata/templates/Character.json");
  });

  it("creates an asset from an existing .blend in the folder", async () => {
    const make = (name: string, files: Record<string, string>, parts = ["model"]) =>
      h.app.inject({ method: "POST", url: "/assets", ...h.as(AD), payload: { project_id: h.seeded.project_id, template_name: "Environment prop", name, parts, files } });
    const res = await make("Old lamp", { model: "props/old_lamp.blend" });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { parts: { name: string; mapping: { kind: string; file: string; collection: string } }[] };
    expect(body.parts[0]?.mapping).toEqual({ kind: "blend_collection", file: "props/old_lamp.blend", collection: "model" });
    // One file, one part.
    expect((await make("Old lamp again", { model: "props/old_lamp.blend" })).statusCode).toBe(409);
    // Only Blender parts take a file, and only parts being created.
    expect((await make("Lamp textures", { textures: "props/t.blend" }, ["textures"])).statusCode).toBe(400);
    expect((await make("Lamp uvs", { uvs: "props/uvs.blend" }, ["model"])).statusCode).toBe(400);
    // The path stays inside the project folder and names a .blend.
    for (const bad of ["../out.blend", "/abs/x.blend", "a/../../x.blend", "props/lamp.fbx"]) {
      expect((await make("Bad path", { model: bad })).statusCode, bad).toBe(400);
    }
  });

  it("creates an asset with one part, and a gate naming an absent part is met", async () => {
    const one = await h.app.inject({ method: "POST", url: "/assets", ...h.as(AD), payload: { project_id: h.seeded.project_id, template_name: "Character", name: "Hat", parts: ["rig"] } });
    expect(one.statusCode).toBe(201);
    const body = one.json() as { parts: { name: string; state: string; waiting_on: string[] }[] };
    expect(body.parts.map((p) => p.name)).toEqual(["rig"]);
    expect(body.parts[0]).toMatchObject({ state: "draft", waiting_on: [] });
    const two = await h.app.inject({ method: "POST", url: "/assets", ...h.as(AD), payload: { project_id: h.seeded.project_id, template_name: "Character", name: "Belt", parts: ["textures", "rig"] } });
    expect((two.json() as { parts: { name: string; state: string; waiting_on: string[] }[] }).parts.map((p) => [p.name, p.state, p.waiting_on])).toEqual([["textures", "draft", []], ["rig", "locked", ["textures"]]]);
    const unknown = await h.app.inject({ method: "POST", url: "/assets", ...h.as(AD), payload: { project_id: h.seeded.project_id, template_name: "Character", name: "Nope", parts: ["wings"] } });
    expect(unknown.statusCode).toBe(400);
  });

  describe("locks", () => {
    it("grants to the owner, reports the holder to others, refreshes on heartbeat, releases on close", async () => {
      const face = parts["face"]!;
      const grant = await h.app.inject({ method: "POST", url: `/parts/${face}/lock`, ...h.as(ARTIST) });
      expect(grant.statusCode).toBe(200);
      expect((grant.json() as { granted: boolean; lock: { holder: { name: string }; stale: boolean } }).lock.holder.name).toBe("Rising Sun artist");

      const held = await h.app.inject({ method: "POST", url: `/parts/${face}/lock`, ...h.as(AD) });
      expect(held.statusCode).toBe(409);
      expect((held.json() as { granted: boolean }).granted).toBe(false);

      const again = await h.app.inject({ method: "POST", url: `/parts/${face}/lock`, ...h.as(ARTIST) });
      expect((again.json() as { granted: boolean }).granted).toBe(true);

      expect((await h.app.inject({ method: "PUT", url: `/parts/${face}/lock`, ...h.as(AD) })).statusCode).toBe(409);
      expect((await h.app.inject({ method: "PUT", url: `/parts/${face}/lock`, ...h.as(ARTIST) })).statusCode).toBe(200);

      const req = await h.app.inject({ method: "POST", url: `/parts/${face}/lock/request`, ...h.as(AD) });
      expect((req.json() as { requested: boolean }).requested).toBe(true);

      expect((await h.app.inject({ method: "DELETE", url: `/parts/${face}/lock`, ...h.as(AD) })).json()).toMatchObject({ released: false });
      expect((await h.app.inject({ method: "DELETE", url: `/parts/${face}/lock`, ...h.as(ARTIST) })).json()).toMatchObject({ released: true });
      expect((await h.app.inject({ method: "POST", url: `/parts/${face}/lock`, ...h.as(AD) })).statusCode).toBe(200);
      await h.app.inject({ method: "DELETE", url: `/parts/${face}/lock`, ...h.as(AD) });
    });

    it("refuses a non owner artist and a gated part", async () => {
      expect((await h.app.inject({ method: "POST", url: `/parts/${parts["face"]}/lock`, ...h.as(ENV) })).statusCode).toBe(403);
      const gated = await h.app.inject({ method: "POST", url: `/parts/${parts["textures"]}/lock`, ...h.as(ARTIST) });
      expect(gated.statusCode).toBe(409);
      expect((gated.json() as { error: { code: string } }).error.code).toBe("gate_closed");
    });

    it("a held part takes no version from anyone else", async () => {
      const cloth = parts["cloth"]!;
      expect((await h.app.inject({ method: "POST", url: `/parts/${cloth}/lock`, ...h.as(ARTIST) })).statusCode).toBe(200);
      const byDirector = await h.app.inject({ method: "POST", url: `/parts/${cloth}/versions`, ...h.as(AD), payload: {} });
      expect(byDirector.statusCode).toBe(409);
      expect((byDirector.json() as { error: { code: string; message: string } }).error).toMatchObject({ code: "lock_held", message: "Rising Sun artist has this part" });
      expect((await h.app.inject({ method: "POST", url: `/parts/${cloth}/versions`, ...h.as(ARTIST), payload: {} })).statusCode).toBe(201);
      await h.app.inject({ method: "DELETE", url: `/parts/${cloth}/lock`, ...h.as(ARTIST) });
      expect((await h.app.inject({ method: "POST", url: `/parts/${cloth}/versions`, ...h.as(AD), payload: {} })).statusCode).toBe(201);
    });

    it("a producer can break a lock and it is logged", async () => {
      const hair = parts["hair"]!;
      await h.app.inject({ method: "POST", url: `/parts/${hair}/lock`, ...h.as(ARTIST) });
      expect((await h.app.inject({ method: "POST", url: `/parts/${hair}/lock/break`, ...h.as(ARTIST) })).statusCode).toBe(403);
      expect((await h.app.inject({ method: "POST", url: `/parts/${hair}/lock/break`, ...h.as(PRODUCER) })).json()).toMatchObject({ released: true });
    });
  });

  describe("versions, publish, review, gates", () => {
    let faceVersion: string;

    it("records a version and its mirror result", async () => {
      const face = parts["face"]!;
      const res = await h.app.inject({ method: "POST", url: `/parts/${face}/versions`, ...h.as(ARTIST), payload: { mirror_status: "pending", note: "first save" } });
      expect(res.statusCode).toBe(201);
      faceVersion = (res.json() as { version: { id: string } }).version.id;
      const mirror = await h.app.inject({ method: "PUT", url: `/parts/${face}/versions/${faceVersion}/mirror`, ...h.as(ARTIST), payload: { mirror_status: "synced", mirror_ms: 4200 } });
      expect((mirror.json() as { version: { mirror_status: string; mirror_ms: number; refs: unknown } }).version).toMatchObject({ mirror_status: "synced", mirror_ms: 4200, refs: null });
      const placed = await h.app.inject({ method: "PUT", url: `/parts/${face}/versions/${faceVersion}/mirror`, ...h.as(ARTIST), payload: { mirror_status: "synced", mirror_ms: 4300, refs: [{ level: "/Game/Levels/L_EnuguMarket", actors: 2 }] } });
      expect((placed.json() as { version: { refs: unknown } }).version.refs).toEqual([{ level: "/Game/Levels/L_EnuguMarket", actors: 2 }]);
      const listed = await h.app.inject({ method: "GET", url: `/parts/${face}/versions`, ...h.as(ARTIST) });
      expect((listed.json() as { versions: { id: string; refs: unknown }[] }).versions.find((v) => v.id === faceVersion)?.refs).toEqual([{ level: "/Game/Levels/L_EnuguMarket", actors: 2 }]);
      expect((await h.app.inject({ method: "PUT", url: `/parts/${face}/versions/${faceVersion}/mirror`, ...h.as(ARTIST), payload: { mirror_status: "synced", refs: [{ level: "", actors: -1 }] } })).statusCode).toBe(400);
      const replay = await h.app.inject({ method: "POST", url: `/parts/${face}/versions`, ...h.as(ARTIST), payload: { id: faceVersion, mirror_status: "pending" } });
      expect(replay.statusCode).toBe(200);
      expect((replay.json() as { version: { note: string } }).version.note).toBe("first save");
    });

    it("blocks publish on a failed blocking check and allows it otherwise", async () => {
      const face = parts["face"]!;
      const blocked = await h.app.inject({
        method: "POST", url: `/parts/${face}/publish`, ...h.as(ARTIST),
        payload: { version_id: faceVersion, ready: true, note: "Face blocked in", check_results: [{ check_id: "triangle_budget", severity: "block", passed: false, auto_fixed: false, message: "72k over 60k" }] },
      });
      expect(blocked.json()).toMatchObject({ published: false, state: "draft" });
      const ok = await h.app.inject({
        method: "POST", url: `/parts/${face}/publish`, ...h.as(ARTIST),
        payload: { version_id: faceVersion, ready: true, note: "Face blocked in, eyes still rough", note_engineering: "Skin material uses the shared T_Skin set.", check_results: [{ check_id: "unit_scale", severity: "block", passed: true, auto_fixed: true, message: "" }] },
      });
      expect(ok.json()).toMatchObject({ published: true, state: "ready", blocked_by: [] });
      // The note is required and travels with the version; the engineering details are optional.
      const noNote = await h.app.inject({ method: "POST", url: `/parts/${face}/publish`, ...h.as(ARTIST), payload: { version_id: faceVersion, ready: false, note: "   " } });
      expect(noNote.statusCode).toBe(400);
      const listed = (await h.app.inject({ method: "GET", url: `/parts/${face}/versions`, ...h.as(VIEWER) })).json() as { versions: { id: string; note: string; note_engineering: string }[] };
      expect(listed.versions.find((x) => x.id === faceVersion)).toMatchObject({ note: "Face blocked in, eyes still rough", note_engineering: "Skin material uses the shared T_Skin set." });
    });

    it("only reviewers approve, and approving opens gates down the chain", async () => {
      const denied = await h.app.inject({ method: "POST", url: "/reviews", ...h.as(ENV), payload: { part_id: parts["face"], version_id: faceVersion, score: 5, decision: "approve" } });
      expect(denied.statusCode).toBe(403);
      const approved = await h.app.inject({ method: "POST", url: "/reviews", ...h.as(AD), payload: { part_id: parts["face"], version_id: faceVersion, score: 4, decision: "approve", note: "Good" } });
      expect(approved.statusCode).toBe(201);
      expect(approved.json()).toMatchObject({ state: "approved", opened: [] });

      // Approve cloth and hair too. textures waits on all three.
      for (const name of ["cloth", "hair"]) {
        const v = await h.app.inject({ method: "POST", url: `/parts/${parts[name]}/versions`, ...h.as(ARTIST), payload: {} });
        const vid = (v.json() as { version: { id: string } }).version.id;
        await h.app.inject({ method: "POST", url: `/parts/${parts[name]}/state`, ...h.as(ARTIST), payload: { action: "mark_ready" } });
        const r = await h.app.inject({ method: "POST", url: "/reviews", ...h.as(AD), payload: { part_id: parts[name], version_id: vid, score: 5, decision: "approve" } });
        expect(r.statusCode).toBe(201);
        if (name === "hair") expect((r.json() as { opened: string[] }).opened).toEqual([parts["textures"]]);
        else expect((r.json() as { opened: string[] }).opened).toEqual([]);
      }
      const textures = await h.app.inject({ method: "GET", url: `/parts/${parts["textures"]}`, ...h.as(ARTIST) });
      expect((textures.json() as { part: { state: string } }).part.state).toBe("draft");
      const rig = await h.app.inject({ method: "GET", url: `/parts/${parts["rig"]}`, ...h.as(ARTIST) });
      expect((rig.json() as { part: { state: string; waiting_on: string[] } }).part).toMatchObject({ state: "locked", waiting_on: ["textures"] });
    });

    it("an approved part is read-only for the artist and an art director can send it back", async () => {
      const face = parts["face"]!;
      expect((await h.app.inject({ method: "POST", url: `/parts/${face}/versions`, ...h.as(ARTIST), payload: {} })).statusCode).toBe(403);
      expect((await h.app.inject({ method: "POST", url: `/parts/${face}/state`, ...h.as(ARTIST), payload: { action: "send_back" } })).statusCode).toBe(403);
      expect((await h.app.inject({ method: "POST", url: `/parts/${face}/state`, ...h.as(AD), payload: { action: "send_back" } })).json()).toMatchObject({ from: "approved", to: "draft" });
    });

    it("removing a gate opens the part at once", async () => {
      expect((await h.app.inject({ method: "POST", url: `/parts/${parts["lookdev"]}/gate/remove`, ...h.as(ARTIST) })).statusCode).toBe(403);
      const res = await h.app.inject({ method: "POST", url: `/parts/${parts["lookdev"]}/gate/remove`, ...h.as(AD) });
      expect(res.json()).toMatchObject({ opened: [parts["lookdev"]] });
    });

    it("rollback creates a new version and keeps history", async () => {
      const face = parts["face"]!;
      const res = await h.app.inject({ method: "POST", url: `/parts/${face}/rollback`, ...h.as(ARTIST), payload: { version_id: faceVersion } });
      expect(res.statusCode).toBe(201);
      const list = await h.app.inject({ method: "GET", url: `/parts/${face}/versions`, ...h.as(ARTIST) });
      expect((list.json() as { versions: unknown[] }).versions.length).toBe(2);
    });

    it("comments pin to a version and export carries them", async () => {
      const res = await h.app.inject({ method: "POST", url: "/comments", ...h.as(AD), payload: { part_id: parts["face"], version_id: faceVersion, point: [0.1, 0.2, 0.3], normal: [0, 0, 1], body: "Shorter here" } });
      expect(res.statusCode).toBe(201);
      const list = await h.app.inject({ method: "GET", url: `/parts/${parts["face"]}/comments`, ...h.as(ARTIST) });
      expect((list.json() as { comments: { body: string; point: number[]; kind: string }[] }).comments[0]).toMatchObject({ body: "Shorter here", kind: "pin" });
      // Take a look: the art director is asked, nothing moves.
      const before = (await h.app.inject({ method: "GET", url: `/assets/${h.seeded.asset_id}`, ...h.as(ARTIST) })).json() as { parts: { name: string; state: string }[] };
      const look = await h.app.inject({ method: "POST", url: "/comments", ...h.as(ARTIST), payload: { part_id: parts["face"], version_id: faceVersion, point: [0, 0, 0], normal: [0, 0, 1], body: "Look at the ears", kind: "take_a_look" } });
      expect((look.json() as { comment: { kind: string } }).comment.kind).toBe("take_a_look");
      const afterLook = (await h.app.inject({ method: "GET", url: `/assets/${h.seeded.asset_id}`, ...h.as(ARTIST) })).json() as { parts: { name: string; state: string }[] };
      expect(afterLook.parts.map((p) => p.state)).toEqual(before.parts.map((p) => p.state));
      const kinds = (await h.app.inject({ method: "GET", url: `/parts/${parts["face"]}/comments`, ...h.as(ARTIST) })).json() as { comments: { kind: string }[] };
      expect(kinds.comments.map((c) => c.kind)).toEqual(["pin", "take_a_look"]);
      const exp = await h.app.inject({ method: "GET", url: `/export/${h.seeded.asset_id}`, ...h.as(PRODUCER) });
      const body = exp.json() as { parts: { name: string; comments: unknown[]; versions: unknown[] }[] };
      expect(body.parts.find((p) => p.name === "face")?.comments).toHaveLength(2);
      expect(body.parts.find((p) => p.name === "face")?.versions).toHaveLength(2);
    });

    it("moves an asset into a named folder and back to the root, and a viewer cannot", async () => {
    const id = h.seeded.assets["Kettle"]!;
    const moved = await h.app.inject({ method: "PUT", url: `/assets/${id}`, ...h.as(ARTIST), payload: { folder: " Market set " } });
    expect(moved.statusCode).toBe(200);
    expect((moved.json() as { asset: { folder: string } }).asset.folder).toBe("Market set");
    const listed = await h.app.inject({ method: "GET", url: `/assets?project_id=${h.seeded.project_id}`, ...h.as(ARTIST) });
    expect((listed.json() as { assets: { id: string; folder: string }[] }).assets.find((a) => a.id === id)?.folder).toBe("Market set");
    expect((await h.app.inject({ method: "PUT", url: `/assets/${id}`, ...h.as(VIEWER), payload: { folder: "x" } })).statusCode).toBe(403);
    expect((await h.app.inject({ method: "PUT", url: `/assets/${id}`, ...h.as(ARTIST), payload: { folder: "a/b" } })).statusCode).toBe(400);
    const back = await h.app.inject({ method: "PUT", url: `/assets/${id}`, ...h.as(ARTIST), payload: { folder: "" } });
    expect((back.json() as { asset: { folder: string } }).asset.folder).toBe("");
  });

  it("a producer turns training on, which pays nothing, stamps new rows, and requires rights to Publish", async () => {
      expect((await h.app.inject({ method: "PUT", url: "/studio/training", ...h.as(ARTIST), payload: { training: "on" } })).statusCode).toBe(403);
      const on = await h.app.inject({ method: "PUT", url: "/studio/training", ...h.as(PRODUCER), payload: { training: "on" } });
      expect(on.json()).toMatchObject({ studio: { training: "on", billing: { line: "Free while Nkata is in testing", seats: 5 } } });
      const events = await h.app.inject({ method: "GET", url: `/events?project_id=${h.seeded.project_id}`, ...h.as(PRODUCER) });
      expect((events.json() as { events: { event: { kind: string } }[] }).events.some((e) => e.event.kind === "studio.training")).toBe(false);
      // A new version is eligible; the old one stays as it was.
      const hair = parts["face"]!;
      const made = await h.app.inject({ method: "POST", url: `/parts/${hair}/versions`, ...h.as(ARTIST), payload: { mirror_status: "pending", opened_at: "2026-10-10T09:00:00.000Z", saved_at: "2026-10-10T09:05:00.000Z" } });
      expect(made.statusCode).toBe(201);
      const ver = (made.json() as { version: { id: string; capture_eligible: boolean; opened_at: string; saved_at: string } }).version;
      expect(ver).toMatchObject({ capture_eligible: true, opened_at: "2026-10-10T09:00:00.000Z", saved_at: "2026-10-10T09:05:00.000Z" });
      const old = await h.app.inject({ method: "GET", url: `/parts/${parts["face"]}/versions`, ...h.as(ARTIST) });
      expect((old.json() as { versions: { id: string; capture_eligible: boolean }[] }).versions.find((v) => v.id === faceVersion)?.capture_eligible).toBe(false);
      // No rights yet: Publish refuses. A reviewer confirms them, then it goes through.
      const refused = await h.app.inject({ method: "POST", url: `/parts/${hair}/publish`, ...h.as(ARTIST), payload: { version_id: ver.id, ready: false, note: "Hair pass one" } });
      expect(refused.statusCode).toBe(409);
      expect((refused.json() as { error: { code: string } }).error.code).toBe("rights_required");
      const rights = await h.app.inject({ method: "PUT", url: `/assets/${h.seeded.assets["Ojukwu"]}/rights`, ...h.as(AD), payload: { statement: "Sunburst Interactive owns Ojukwu outright." } });
      expect((rights.json() as { asset: { rights: { statement: string; confirmed_by: string } } }).asset.rights).toMatchObject({ statement: "Sunburst Interactive owns Ojukwu outright.", confirmed_by: h.seeded.users[AD] });
      expect((await h.app.inject({ method: "PUT", url: `/assets/${h.seeded.assets["Ojukwu"]}/rights`, ...h.as(ARTIST), payload: { statement: "x" } })).statusCode).toBe(403);
      const published = await h.app.inject({ method: "POST", url: `/parts/${hair}/publish`, ...h.as(ARTIST), payload: { version_id: ver.id, ready: false, note: "Hair pass one" } });
      expect(published.json()).toMatchObject({ published: true });
      // Off again: the stamped rows keep their value.
      await h.app.inject({ method: "PUT", url: "/studio/training", ...h.as(PRODUCER), payload: { training: "off" } });
      const after = await h.app.inject({ method: "GET", url: `/parts/${hair}/versions`, ...h.as(ARTIST) });
      expect((after.json() as { versions: { id: string; capture_eligible: boolean }[] }).versions.find((v) => v.id === ver.id)?.capture_eligible).toBe(true);
    });

    it("a member acknowledges capture once and gets a pseudonymous training id", async () => {
      const first = await h.app.inject({ method: "POST", url: "/me/capture-ack", ...h.as(ENV) });
      expect(first.statusCode).toBe(200);
      const a = first.json() as { capture_ack_at: string; training_id: string };
      expect(a.training_id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
      const second = await h.app.inject({ method: "POST", url: "/me/capture-ack", ...h.as(ENV) });
      expect(second.json()).toEqual({ v: 1, capture_ack_at: a.capture_ack_at, training_id: a.training_id });
    });

    it("stores a Mark Ready render under the version and serves a signed link", async () => {
      const face = parts["face"]!;
      const url = await h.app.inject({ method: "POST", url: `/parts/${face}/versions/${faceVersion}/render-url`, ...h.as(ARTIST), payload: { size: 4 } });
      expect(url.statusCode).toBe(200);
      const { key, url: put } = url.json() as { key: string; url: string };
      expect(key).toBe(`studios/${h.seeded.studio_id}/renders/${face}/${faceVersion}.png`);
      const early = await h.app.inject({ method: "PUT", url: `/parts/${face}/versions/${faceVersion}/render`, ...h.as(ARTIST), payload: { key } });
      expect(early.statusCode).toBe(422);
      expect((await h.app.inject({ method: "GET", url: `/parts/${face}/versions/${faceVersion}/render`, ...h.as(VIEWER) })).statusCode).toBe(404);
      const upload = await fetch(put, { method: "PUT", body: Buffer.from("PNG!"), headers: { "content-length": "4" } });
      expect(upload.ok).toBe(true);
      const done = await h.app.inject({ method: "PUT", url: `/parts/${face}/versions/${faceVersion}/render`, ...h.as(ARTIST), payload: { key } });
      expect((done.json() as { version: { render_key: string } }).version.render_key).toBe(key);
      const got = await h.app.inject({ method: "GET", url: `/parts/${face}/versions/${faceVersion}/render`, ...h.as(VIEWER) });
      const link = (got.json() as { url: string }).url;
      expect(await (await fetch(link)).text()).toBe("PNG!");
    });

    it("stores the version's model the same way and lists both links on the version", async () => {
      const face = parts["face"]!;
      const url = await h.app.inject({ method: "POST", url: `/parts/${face}/versions/${faceVersion}/model-url`, ...h.as(ARTIST), payload: { size: 4 } });
      const { key, url: put } = url.json() as { key: string; url: string };
      expect(key).toBe(`studios/${h.seeded.studio_id}/models/${face}/${faceVersion}.glb`);
      expect((await h.app.inject({ method: "PUT", url: `/parts/${face}/versions/${faceVersion}/model`, ...h.as(ARTIST), payload: { key: key.replace(".glb", ".png") } })).statusCode).toBe(400);
      expect((await h.app.inject({ method: "PUT", url: `/parts/${face}/versions/${faceVersion}/model`, ...h.as(ARTIST), payload: { key } })).statusCode).toBe(422);
      expect((await fetch(put, { method: "PUT", body: Buffer.from("glTF"), headers: { "content-length": "4" } })).ok).toBe(true);
      expect((await h.app.inject({ method: "PUT", url: `/parts/${face}/versions/${faceVersion}/model`, ...h.as(VIEWER), payload: { key } })).statusCode).toBe(403);
      const done = (await h.app.inject({ method: "PUT", url: `/parts/${face}/versions/${faceVersion}/model`, ...h.as(ARTIST), payload: { key } })).json() as { version: { model_key: string; model_url: string; render_url: string } };
      expect(done.version.model_key).toBe(key);
      // The model link is this server's, signed, and answers the bytes with CORS for the app's
      // origin and no session. The store's own URL would need CORS the stores do not all give.
      expect(done.version.model_url.startsWith(`${h.app.config.PUBLIC_URL}/models/${faceVersion}.glb?exp=`)).toBe(true);
      const link = new URL(done.version.model_url);
      const served = await h.app.inject({ method: "GET", url: `${link.pathname}${link.search}`, headers: { origin: "http://localhost:1420" } });
      expect(served.statusCode).toBe(200);
      expect(served.headers["content-type"]).toBe("model/gltf-binary");
      expect(served.headers["access-control-allow-origin"]).toBe("http://localhost:1420");
      expect(served.body).toBe("glTF");
      expect((await h.app.inject({ method: "GET", url: `${link.pathname}?exp=${link.searchParams.get("exp")}&sig=00` })).statusCode).toBe(403);
      expect((await h.app.inject({ method: "GET", url: `${link.pathname}?exp=1&sig=${link.searchParams.get("sig")}` })).statusCode).toBe(403);
      const list = (await h.app.inject({ method: "GET", url: `/parts/${face}/versions`, ...h.as(VIEWER) })).json() as { versions: { id: string; model_url: string | null; render_url: string | null }[] };
      const v = list.versions.find((x) => x.id === faceVersion)!;
      expect(v.model_url).toContain("/models/");
      expect(v.render_url).toContain("renders/");
      expect(list.versions.filter((x) => x.id !== faceVersion).every((x) => x.model_url === null)).toBe(true);
    });

    it("names the export file from the template: SK_{asset}_{part} for a character, SM_{asset} for a prop", async () => {
      const face = (await h.app.inject({ method: "GET", url: `/parts/${parts["face"]}`, ...h.as(VIEWER) })).json() as { part: { export_name: string } };
      expect(face.part.export_name).toBe("SK_Ojukwu_face");
      const list = (await h.app.inject({ method: "GET", url: `/parts?project_id=${h.seeded.project_id}`, ...h.as(VIEWER) })).json() as { parts: { asset_name: string; name: string; export_name: string }[] };
      expect(list.parts.find((p) => p.asset_name === "Market stall" && p.name === "model")?.export_name).toBe("SM_Market_stall");
    });

    it("finds the .blend behind a version: the sync's file version right after the save, else the last before", async () => {
      const face = parts["face"]!;
      const ver = (await h.app.inject({ method: "GET", url: `/parts/${face}/versions`, ...h.as(VIEWER) })).json() as { versions: { id: string; created_at: string }[] };
      const at = new Date(ver.versions.find((x) => x.id === faceVersion)!.created_at);
      const { file_version } = await import("../src/db/schema.js");
      const row = (offset: number, id: string) => ({ id, studio_id: h.seeded.studio_id, project_id: h.seeded.project_id, path: "Ojukwu/face.blend", size: 4, blake3: `b${id}`, chunk_hashes: [`c${id}`], created_at: new Date(at.getTime() + offset), updated_at: new Date(at.getTime() + offset) });
      await h.app.db.insert(file_version).values([row(-60_000, "01FVBEFORE000000000000000A"), row(2_000, "01FVAFTER0000000000000000B"), row(90_000, "01FVLATER0000000000000000C")]);
      const found = (await h.app.inject({ method: "GET", url: `/parts/${face}/versions/${faceVersion}/file`, ...h.as(VIEWER) })).json() as { file_version: { id: string; path: string }; exact: boolean };
      expect(found).toMatchObject({ file_version: { id: "01FVAFTER0000000000000000B", path: "Ojukwu/face.blend" }, exact: true });
      await h.app.db.delete(file_version).where((await import("drizzle-orm")).eq(file_version.id, "01FVAFTER0000000000000000B"));
      await h.app.db.delete(file_version).where((await import("drizzle-orm")).eq(file_version.id, "01FVLATER0000000000000000C"));
      const fallback = (await h.app.inject({ method: "GET", url: `/parts/${face}/versions/${faceVersion}/file`, ...h.as(VIEWER) })).json() as { file_version: { id: string }; exact: boolean };
      expect(fallback).toMatchObject({ file_version: { id: "01FVBEFORE000000000000000A" }, exact: false });
    });

    it("stores the FBX the add-on exports on Publish and serves it under a signed link", async () => {
      const face = parts["face"]!;
      const { key, url: put } = (await h.app.inject({ method: "POST", url: `/parts/${face}/versions/${faceVersion}/fbx-url`, ...h.as(ARTIST), payload: { size: 7 } })).json() as { key: string; url: string };
      expect(key).toBe(`studios/${h.seeded.studio_id}/exports/${face}/${faceVersion}.fbx`);
      expect((await fetch(put, { method: "PUT", body: Buffer.from("Kaydara"), headers: { "content-length": "7" } })).ok).toBe(true);
      const done = (await h.app.inject({ method: "PUT", url: `/parts/${face}/versions/${faceVersion}/fbx`, ...h.as(ARTIST), payload: { key } })).json() as { version: { fbx_key: string; fbx_url: string } };
      expect(done.version.fbx_key).toBe(key);
      const link = new URL(done.version.fbx_url);
      expect(link.pathname).toBe(`/models/${faceVersion}.fbx`);
      const served = await h.app.inject({ method: "GET", url: `${link.pathname}${link.search}`, headers: { origin: "http://localhost:1420" } });
      expect(served.statusCode).toBe(200);
      expect(served.headers["content-type"]).toBe("application/octet-stream");
      expect(served.body).toBe("Kaydara");
    });

    it("the event log replays in order with a cursor", async () => {
      const first = await h.app.inject({ method: "GET", url: `/events?project_id=${h.seeded.project_id}&limit=3`, ...h.as(ARTIST) });
      const page = first.json() as { events: { id: string; event: { kind: string } }[]; next: string; more: boolean };
      expect(page.events).toHaveLength(3);
      expect(page.more).toBe(true);
      const rest = await h.app.inject({ method: "GET", url: `/events?project_id=${h.seeded.project_id}&since=${page.next}`, ...h.as(ARTIST) });
      const kinds = (rest.json() as { events: { event: { kind: string } }[] }).events.map((e) => e.event.kind);
      expect(kinds).toContain("review.decided");
      expect(kinds).toContain("gate.opened");
      expect(kinds).not.toContain("audit.gate_removed");
    });
  });
  describe("presence, members, discord", () => {
    it("heartbeats through REST and lists who is online", async () => {
      const face = parts["face"]!;
      const r = await h.app.inject({ method: "POST", url: "/presence", ...h.as(ARTIST), payload: { v: 1, project_id: h.seeded.project_id, part_id: face } });
      expect(r.statusCode).toBe(200);
      const online = (r.json() as { online: { user: { name: string }; part_id: string | null }[] }).online;
      expect(online).toEqual([{ user: expect.objectContaining({ name: "Rising Sun artist" }), part_id: face, since: expect.any(String), last_seen: expect.any(String) }]);
      // A viewer may be present. It is not a write to the project.
      expect((await h.app.inject({ method: "POST", url: "/presence", ...h.as(VIEWER), payload: { v: 1, project_id: h.seeded.project_id, part_id: null } })).statusCode).toBe(200);
      const list = await h.app.inject({ method: "GET", url: `/presence?project_id=${h.seeded.project_id}`, ...h.as(VIEWER) });
      expect((list.json() as { online: unknown[] }).online).toHaveLength(2);
    });

    it("names the studio and counts its members", async () => {
      const res = await h.app.inject({ method: "GET", url: "/studio", ...h.as(VIEWER) });
      expect(res.json()).toEqual({ v: 1, studio: { id: h.seeded.studio_id, name: "Sunburst Interactive", member_count: 5, training: "off", billing: { line: "Free while Nkata is in testing", seats: 5 } } });
    });

    it("lists members and lets a producer invite and set roles", async () => {
      const members = await h.app.inject({ method: "GET", url: `/projects/${h.seeded.project_id}/members`, ...h.as(VIEWER) });
      const emails = (members.json() as { members: { email: string; roles: string[] }[] }).members.map((m) => m.email).sort();
      expect(emails).toEqual(["artist@sunburst.gg", "director@sunburst.gg", "env@sunburst.gg", "producer@sunburst.gg", "viewer@sunburst.gg"]);
      const denied = await h.app.inject({ method: "POST", url: `/projects/${h.seeded.project_id}/members`, ...h.as(AD), payload: { email: "new@sunburst.gg", name: "New artist", roles: ["artist"] } });
      expect(denied.statusCode).toBe(403);
      const before = h.mailed.length;
      const invited = await h.app.inject({ method: "POST", url: `/projects/${h.seeded.project_id}/members`, ...h.as(PRODUCER), payload: { email: "new@sunburst.gg", name: "New artist", roles: ["artist"], note: "Start with Ojukwu." } });
      expect(invited.statusCode).toBe(201);
      // Through a project: the project invite, with the note.
      const mail = h.mailed.slice(before);
      expect(mail).toHaveLength(1);
      expect(mail[0]!.subject).toContain("shared Rising Sun with you");
      expect(mail[0]!.html).toContain("Start with Ojukwu.");
      expect(mail[0]!.html).toContain("Open Rising Sun");
      const again = await h.app.inject({ method: "POST", url: `/projects/${h.seeded.project_id}/members`, ...h.as(PRODUCER), payload: { email: "new@sunburst.gg", name: "New artist", roles: ["artist", "art_director"] } });
      expect(again.statusCode).toBe(200);
      expect((again.json() as { member: { roles: string[] } }).member.roles).toEqual(["artist", "art_director"]);
      const link = await h.app.inject({ method: "POST", url: "/auth/magic-link", payload: { email: "new@sunburst.gg" } });
      expect((link.json() as { link?: string }).link).toBeDefined();
    });

    it("stores the Discord webhook encrypted and never returns it", async () => {
      const pid = h.seeded.project_id;
      expect((await h.app.inject({ method: "PUT", url: `/projects/${pid}/discord`, ...h.as(AD), payload: { webhook_url: "https://discord.com/api/webhooks/1/x" } })).statusCode).toBe(403);
      expect((await h.app.inject({ method: "PUT", url: `/projects/${pid}/discord`, ...h.as(PRODUCER), payload: { webhook_url: "not a url" } })).statusCode).toBe(400);
      const set = await h.app.inject({ method: "PUT", url: `/projects/${pid}/discord`, ...h.as(PRODUCER), payload: { webhook_url: "https://discord.com/api/webhooks/1/x" } });
      expect(set.json()).toEqual({ v: 1, configured: true });
      const proj = (await h.app.inject({ method: "GET", url: `/projects/${pid}`, ...h.as(ARTIST) })).json() as { project: Record<string, unknown> };
      expect(proj.project["discord_configured"]).toBe(true);
      expect(proj.project["discord_webhook"]).toBeUndefined();
      expect(JSON.stringify((await h.app.inject({ method: "GET", url: "/projects", ...h.as(ARTIST) })).json())).not.toContain("webhooks/1/x");
      expect((await h.app.inject({ method: "PUT", url: `/projects/${pid}/discord`, ...h.as(PRODUCER), payload: { webhook_url: null } })).json()).toEqual({ v: 1, configured: false });
    });
  });

  // docs/product.md, Roles and permissions: the server refuses a viewer on every write.
  describe("viewer", () => {
    const refused: [string, string, unknown][] = [
      ["POST", "/parts/{face}/lock", undefined],
      ["PUT", "/parts/{face}/lock", undefined],
      ["DELETE", "/parts/{face}/lock", undefined],
      ["POST", "/parts/{face}/lock/request", undefined],
      ["POST", "/parts/{face}/lock/break", undefined],
      ["POST", "/parts/{face}/versions", {}],
      ["PUT", "/parts/{face}/versions/01ARZ3NDEKTSV4RRFFQ69G5FAV/mirror", { mirror_status: "synced", mirror_ms: 1 }],
      ["POST", "/parts/{face}/publish", { version_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", check_results: [], ready: false }],
      ["POST", "/parts/{face}/rollback", { version_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV" }],
      ["POST", "/parts/{face}/state", { action: "mark_ready" }],
      ["POST", "/parts/{face}/gate/remove", undefined],
      ["PATCH", "/parts/{face}", { owner_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV" }],
      ["POST", "/reviews", { part_id: "{face}", version_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", score: 5, decision: "approve" }],
      ["PUT", "/projects/{project}/templates/Character", { file_path: "x", schema: {} }],
      ["POST", "/assets", { project_id: "{project}", template_name: "Character", name: "Nobody" }],
      ["POST", "/projects", { name: "Side", folder_name: "side", blender_version: "4.2", ue_version: "5.4", package_version: "0.1.0" }],
      ["POST", "/files/upload-urls", { project_id: "{project}", chunks: [] }],
      ["POST", "/files/uploaded", { project_id: "{project}", chunks: [] }],
      ["POST", "/projects/{project}/file-versions", {}],
      ["POST", "/projects/{project}/members", { email: "x@sunburst.gg", name: "X", roles: ["artist"] }],
      ["POST", "/studio/members", { email: "x@sunburst.gg", roles: ["artist"] }],
      ["PUT", "/studio", { name: "Mine" }],
      ["PUT", "/projects/{project}", { name: "Mine" }],
      ["DELETE", "/projects/{project}", undefined],
      ["POST", "/projects/{project}/restore", undefined],
      ["PUT", "/projects/{project}/discord", { webhook_url: null }],
    ];
    const fill = (s: string) => s.replaceAll("{face}", parts["face"]!).replaceAll("{project}", h.seeded.project_id);

    it.each(refused)("gets 403 on %s %s", async (method, url, payload) => {
      const body = payload === undefined ? undefined : JSON.parse(fill(JSON.stringify(payload))) as Record<string, unknown>;
      const res = await h.app.inject({ method: method as "POST", url: fill(url), ...h.as(VIEWER), ...(body === undefined ? {} : { payload: body }) });
      expect(res.statusCode).toBe(403);
      expect((res.json() as { error: { code: string } }).error.code).toBe("forbidden");
    });

    it("reads, comments, resolves, downloads, and exports one asset", async () => {
      const face = parts["face"]!;
      expect((await h.app.inject({ method: "GET", url: `/assets?project_id=${h.seeded.project_id}`, ...h.as(VIEWER) })).statusCode).toBe(200);
      const versions = (await h.app.inject({ method: "GET", url: `/parts/${face}/versions`, ...h.as(VIEWER) })).json() as { versions: { id: string }[] };
      const created = await h.app.inject({ method: "POST", url: "/comments", ...h.as(VIEWER), payload: { part_id: face, version_id: versions.versions[0]!.id, point: [0, 0, 0], normal: [0, 0, 1], body: "Reads well from the gate." } });
      expect(created.statusCode).toBe(201);
      const id = (created.json() as { comment: { id: string } }).comment.id;
      expect((await h.app.inject({ method: "POST", url: `/comments/${id}/resolve`, ...h.as(VIEWER) })).statusCode).toBe(200);
      expect((await h.app.inject({ method: "POST", url: "/files/download-urls", ...h.as(VIEWER), payload: { project_id: h.seeded.project_id, hashes: [] } })).statusCode).toBe(200);
      expect((await h.app.inject({ method: "GET", url: `/export/${h.seeded.asset_id}`, ...h.as(VIEWER) })).statusCode).toBe(200);
    });
  });
});
