// The server data source against a fake fetch: the mapping from the wire to the screens' shapes.
import { describe, expect, it } from "vitest";
import { activityOf, ago, checkOf, createServerSource, digestsOf, primaryRole, slugOf, toneOf } from "./server";

const NOW = new Date("2026-10-05T12:00:00.000Z");
const ID = { studio: "01A", project: "01P", ojukwu: "01AO", face: "01PF", ada: "01UA", emeka: "01UE", tpl: "01T", v1: "01V1", v2: "01V2", c1: "01C1" };
const ada = { id: ID.ada, name: "Ada Okafor", avatar_url: null };
const emeka = { id: ID.emeka, name: "Emeka Nwosu", avatar_url: null };

function routes(): Record<string, unknown> {
  return {
    "GET /auth/me": { v: 1, user: ada, email: "ada@sunburst.gg", studio_id: ID.studio, roles: ["artist"], studios: [{ id: ID.studio, name: "Sunburst Interactive", roles: ["artist"] }] },
    "GET /studio": { v: 1, studio: { id: ID.studio, name: "Sunburst Interactive", member_count: 2 } },
    "GET /projects": { v: 1, projects: [{ id: ID.project, name: "Rising Sun", folder_name: "rising-sun", blender_version: "4.2", ue_version: "5.4" }] },
    "GET /studio/members": { v: 1, members: [{ user: ada, email: "ada@sunburst.gg", roles: ["artist"] }, { user: emeka, email: "emeka@sunburst.gg", roles: ["artist", "art_director"] }] },
    [`GET /presence?project_id=${ID.project}`]: { v: 1, online: [{ user: ada, part_id: ID.face, since: "2026-10-05T11:50:00.000Z", last_seen: "2026-10-05T11:59:30.000Z" }] },
    [`GET /assets?project_id=${ID.project}`]: { v: 1, assets: [{ id: ID.ojukwu, name: "Ojukwu", template_id: ID.tpl, state: "draft", updated_at: "2026-10-05T11:00:00.000Z" }] },
    [`GET /projects/${ID.project}/templates`]: { v: 1, templates: [{ id: ID.tpl, name: "Character", schema: { kind: "character", parts: [{ name: "face", gate: [], checks: ["unit_scale", "triangle_budget"] }, { name: "rig", gate: ["face"], checks: ["rig_bone_names"] }] } }] },
    [`GET /events?project_id=${ID.project}&limit=1000`]: { v: 1, events: [
      { id: "01E1", event: { v: 1, kind: "version.created", project_id: ID.project, actor_id: ID.ada, at: "2026-10-05T11:30:00.000Z", part_id: ID.face, version_id: ID.v1, published: false } },
      { id: "01E2", event: { v: 1, kind: "comment.created", project_id: ID.project, actor_id: ID.emeka, at: "2026-10-05T11:40:00.000Z", comment: { id: ID.c1, part_id: ID.face, author: emeka, body: "Steam too strong.", resolved_at: null, created_at: "2026-10-05T11:40:00.000Z" } } },
      { id: "01E3", event: { v: 1, kind: "part.state", project_id: ID.project, actor_id: ID.ada, at: "2026-09-30T11:00:00.000Z", part_id: ID.face, from: "draft", to: "ready" } },
    ] },
    [`GET /assets/${ID.ojukwu}`]: { v: 1, asset: {}, parts: [
      { id: ID.face, asset_id: ID.ojukwu, asset_name: "Ojukwu", kind: "character", name: "face", position: 0, state: "draft", owner: ada, owner_id: ID.ada, lock: { holder: ada, granted_at: "2026-10-05T11:48:00.000Z" }, gate: { after: [] }, waiting_on: [], checks: [], reference_files: [], updated_at: "2026-10-05T11:30:00.000Z" },
      { id: "01PR", asset_id: ID.ojukwu, asset_name: "Ojukwu", kind: "character", name: "rig", position: 1, state: "locked", owner: null, owner_id: null, lock: null, gate: { after: ["face"] }, waiting_on: ["face"], checks: [], reference_files: [], updated_at: "2026-10-05T11:00:00.000Z" },
    ] },
    [`GET /parts/${ID.face}/versions`]: { v: 1, versions: [
      { id: ID.v2, part_id: ID.face, author_id: ID.ada, mirror_status: "synced", mirror_ms: 4200, refs: [{ level: "/Game/Levels/L_EnuguMarket", actors: 2 }], published: true, note: "", created_at: "2026-10-05T11:30:00.000Z", render_url: "https://store/renders/face/v2.png", model_url: "https://store/models/face/v2.glb", manifest: { v: 1, kind: "character", objects: [{ name: "Face", triangles: 1200, materials: ["M_Skin"], bounds_min: [0, 0, 0], bounds_max: [1, 1, 2], hash: "abc", origin: [0, 0, 0], scale: [1, 1, 1] }], bone_count: 42, armature: "Armature", mirror_target: null } },
      { id: ID.v1, part_id: ID.face, author_id: ID.ada, mirror_status: "failed", mirror_ms: null, refs: null, published: false, note: "", created_at: "2026-10-05T10:00:00.000Z" },
    ] },
    [`GET /parts/${ID.face}/comments`]: { v: 1, comments: [{ id: ID.c1, part_id: ID.face, author: emeka, body: "Steam too strong.", resolved_at: null, created_at: "2026-10-05T11:40:00.000Z" }] },
    [`GET /parts/${ID.face}/versions/${ID.v2}/checks`]: { v: 1, version_id: ID.v2, results: [{ check_id: "triangle_budget", severity: "block", passed: false, auto_fixed: false, message: "48,200 of 30,000" }, { check_id: "unit_scale", severity: "block", passed: true, auto_fixed: true, message: "" }] },
    "GET /parts/01PR/versions": { v: 1, versions: [] },
    "GET /parts/01PR/comments": { v: 1, comments: [] },
  };
}

function fakeFetch(table: Record<string, unknown>, calls: string[]) {
  return async (input: string, init?: RequestInit): Promise<Response> => {
    const key = `${init?.method ?? "GET"} ${input.replace("http://test", "")}`;
    calls.push(key);
    const body = table[key] ?? (init?.method && init.method !== "GET" ? { v: 1, ok: true } : undefined);
    if (body === undefined) return new Response(JSON.stringify({ v: 1, error: { code: "not_found", message: key } }), { status: 404 });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
}

describe("server source helpers", () => {
  it("maps names, roles, times, and checks", () => {
    expect(slugOf("Enugu Market / square")).toBe("enugu-market-square");
    expect(primaryRole(["artist", "art_director"])).toBe("art_director");
    expect(primaryRole(["viewer"])).toBe("viewer");
    expect(primaryRole([])).toBe("viewer");
    expect(ago("2026-10-05T11:59:40.000Z", NOW)).toBe("now");
    expect(ago("2026-10-05T11:48:00.000Z", NOW)).toBe("12 min");
    expect(ago("2026-10-05T09:00:00.000Z", NOW)).toBe("3 h");
    expect(ago("2026-10-01T09:00:00.000Z", NOW)).toBe("4 d");
    expect(toneOf("abc")).toBeGreaterThanOrEqual(1);
    expect(checkOf({ check_id: "triangle_budget", severity: "block", passed: false, auto_fixed: false, message: "48,200 of 30,000" })).toEqual({ id: "triangle_budget", name: "Triangle budget", detail: "48,200 of 30,000", status: "fail", blocks: true, fixable: false });
    expect(checkOf({ check_id: "unit_scale", severity: "block", passed: false, auto_fixed: false, message: "0.01" }).fixable).toBe(true);
    expect(checkOf({ check_id: "texture_size", severity: "warn", passed: false, auto_fixed: false, message: "3 over" }).status).toBe("warn");
  });

  it("turns events into activity and the two weeks into digests", () => {
    const parts = new Map([[ID.face, { assetSlug: "ojukwu", assetName: "Ojukwu", partName: "face" }]]);
    const people = new Map();
    const saved = activityOf({ id: "e", event: { kind: "version.created", actor_id: ID.ada, at: "2026-10-05T11:30:00.000Z", part_id: ID.face, published: true } }, people, parts, NOW);
    expect(saved).toMatchObject({ personId: ID.ada, text: "published.", target: "Ojukwu / face", dot: "approved", when: "30 min" });
    const review = activityOf({ id: "e", event: { kind: "review.decided", actor_id: ID.emeka, at: "2026-10-05T11:30:00.000Z", part_id: ID.face, decision: "send_back", score: 2 } }, people, parts, NOW);
    expect(review?.text).toBe("sent back, 2 of 5.");
    expect(activityOf({ id: "e", event: { kind: "mirror.result", actor_id: ID.ada, at: "2026-10-05T11:30:00.000Z", part_id: ID.face, status: "synced" } }, people, parts, NOW)).toBeNull();
    const assets = [{ id: ID.ojukwu, slug: "ojukwu", name: "Ojukwu", parts: [{ id: ID.face, name: "face" }] }] as never;
    const digests = digestsOf((routes()[`GET /events?project_id=${ID.project}&limit=1000`] as { events: never[] }).events, assets, people, NOW);
    expect(digests).toHaveLength(2);
    expect(digests[0]).toMatchObject({ changed: 1, moved: 1, notes: 1, hasPrevious: true, hasNext: false });
    expect(digests[1]).toMatchObject({ changed: 0, moved: 0, notes: 0, hasPrevious: false, hasNext: true });
    expect(digests[0]!.moves[0]).toMatchObject({ assetSlug: "ojukwu", name: "Ojukwu / face", from: "draft", to: "ready", when: "5 d" });
  });
});

describe("server source", () => {
  it("loads the project into the screens' shapes and writes through the routes", async () => {
    const calls: string[] = [];
    const src = createServerSource({ serverUrl: "http://test", token: "t", projectId: ID.project, folder: "/home/ada/rising-sun", theme: "dark", fetch: fakeFetch(routes(), calls), now: () => NOW });
    await src.load();
    const db = src.snapshot();
    expect(db.session.user).toMatchObject({ id: ID.ada, name: "Ada Okafor", role: "artist", presence: "online", where: "In Ojukwu / face" });
    expect(db.session.studio).toMatchObject({ name: "Sunburst Interactive", peopleCount: 2 });
    expect(db.session.studio.projects[0]).toMatchObject({ id: ID.project, slug: "rising-sun", name: "Rising Sun", assetCount: 1, folder: "/home/ada/rising-sun", blender: "4.2", unreal: "5.4" });
    expect(db.people.map((p) => [p.name, p.role, p.presence])).toEqual([["Ada Okafor", "artist", "online"], ["Emeka Nwosu", "art_director", "offline"]]);
    const ojukwu = db.assets[0]!;
    expect(ojukwu).toMatchObject({ slug: "ojukwu", kind: "Characters", state: "failed", template: "Character", usedIn: ["L_EnuguMarket"], present: [ID.ada] });
    const face = ojukwu.parts[0]!;
    expect(face).toMatchObject({ name: "face", state: "draft", ownerId: ID.ada, lock: { holderId: ID.ada, since: "12 min" }, mirror: { state: "synced", seconds: 4 } });
    expect(face.versions.map((v) => [v.n, v.note, v.mirror])).toEqual([[2, "published", "synced"], [1, "", "failed"]]);
    // The version's model and render reach the viewer; the asset shows the newest of its parts.
    expect(face.versions[0]).toMatchObject({ model: "https://store/models/face/v2.glb", render: { url: "https://store/renders/face/v2.png" }, manifest: { bones: 42, objects: [{ name: "Face", triangles: 1200, hash: "abc" }] } });
    expect(face.versions[1]!.model).toBeUndefined();
    expect(ojukwu.model).toBe("https://store/models/face/v2.glb");
    expect(ojukwu.render).toEqual({ url: "https://store/renders/face/v2.png" });
    expect(face.checks.map((c) => [c.name, c.status])).toEqual([["Triangle budget", "fail"], ["Scale", "pass"]]);
    expect(face.comments[0]).toMatchObject({ authorId: ID.emeka, text: "Steam too strong.", partName: "face", source: "Nkata" });
    expect(ojukwu.parts[1]).toMatchObject({ name: "rig", state: "waiting", gate: ["face"], versions: [], mirror: { state: "offline" } });
    expect(db.templates[0]).toMatchObject({ name: "Character", usedBy: 1, parts: [{ name: "face", checks: ["Scale", "Triangle budget"] }, { name: "rig", gate: ["face"] }] });
    expect(db.activity.map((a) => a.text)).toEqual(["left a note.", "saved.", "marked Ready."]);
    expect(db.online).toBe(1);
    expect(db.changedToday).toBe(1);
    expect(db.changedThisWeek).toBe(1);
    expect(db.digests[0]!.weekNotes[0]).toMatchObject({ personId: ID.emeka, text: "Steam too strong." });

    // Writes go to the routes and the screen updates at once.
    expect(src.markReady("ojukwu", "face")).toEqual({ ok: false, reason: "1 check blocks. Fix it in Blender, then mark Ready." });
    expect(src.fixChecks("ojukwu", "face").ok).toBe(false);
    const made = src.rollBack("ojukwu", "face", 1);
    expect(made).toMatchObject({ n: 3, from: 1 });
    src.removeGate("ojukwu", "rig");
    expect(src.snapshot().assets[0]!.parts[1]!.state).toBe("draft");
    const c = src.addComment("ojukwu", "face", "Chin.");
    expect(c.text).toBe("Chin.");
    src.invite("new@sunburst.gg", "viewer");
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toContain(`POST /parts/${ID.face}/rollback`);
    expect(calls).toContain("POST /parts/01PR/gate/remove");
    expect(calls).toContain("POST /comments");
    expect(calls).toContain("POST /studio/members");
  });
});
