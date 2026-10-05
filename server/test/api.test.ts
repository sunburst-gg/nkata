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

  it("does not reveal unknown emails", async () => {
    const res = await h.app.inject({ method: "POST", url: "/auth/magic-link", payload: { email: "nobody@example.com" } });
    expect(res.json()).toEqual({ v: 1, sent: true });
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
      { id: "unit_scale", severity: "block", params: {} },
      { id: "name_pattern", severity: "block", params: {} },
      { id: "triangle_budget", severity: "block", params: { max: 60000 } },
      { id: "uv_set_present", severity: "block", params: {} },
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
    const kettleParts = (kettle.json() as { parts: { name: string; kind: string; mapping: unknown }[] }).parts;
    expect(kettleParts.map((p) => p.name)).toEqual(["concept", "model", "uvs", "textures", "lods", "collision"]);
    expect(kettleParts.find((p) => p.name === "lods")?.mapping).toEqual({ kind: "ue_asset", path: "/Game/Props/Kettle" });
    const square = await h.app.inject({ method: "GET", url: `/assets/${h.seeded.assets["Enugu Market / square"]}`, ...h.as(ARTIST) });
    const squareParts = (square.json() as { parts: { name: string; state: string; kind: string; mapping: unknown }[] }).parts;
    expect(squareParts.map((p) => p.name)).toEqual(["blockout", "layout", "set_dressing", "lighting"]);
    expect(squareParts[0]?.kind).toBe("level_area");
    expect(kettleParts[0]?.kind).toBe("prop");
    expect(squareParts[0]?.mapping).toEqual({ kind: "ue_area", level: "Enugu Market", area: "square" });
    expect(squareParts.map((p) => p.state)).toEqual(["draft", "locked", "locked", "locked"]);
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
        payload: { version_id: faceVersion, ready: true, check_results: [{ check_id: "triangle_budget", severity: "block", passed: false, auto_fixed: false, message: "72k over 60k" }] },
      });
      expect(blocked.json()).toMatchObject({ published: false, state: "draft" });
      const ok = await h.app.inject({
        method: "POST", url: `/parts/${face}/publish`, ...h.as(ARTIST),
        payload: { version_id: faceVersion, ready: true, check_results: [{ check_id: "unit_scale", severity: "block", passed: true, auto_fixed: true, message: "" }] },
      });
      expect(ok.json()).toMatchObject({ published: true, state: "ready", blocked_by: [] });
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
      expect((list.json() as { comments: { body: string; point: number[] }[] }).comments[0]).toMatchObject({ body: "Shorter here" });
      const exp = await h.app.inject({ method: "GET", url: `/export/${h.seeded.asset_id}`, ...h.as(PRODUCER) });
      const body = exp.json() as { parts: { name: string; comments: unknown[]; versions: unknown[] }[] };
      expect(body.parts.find((p) => p.name === "face")?.comments).toHaveLength(1);
      expect(body.parts.find((p) => p.name === "face")?.versions).toHaveLength(2);
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

    it("lists members and lets a producer invite and set roles", async () => {
      const members = await h.app.inject({ method: "GET", url: `/projects/${h.seeded.project_id}/members`, ...h.as(VIEWER) });
      const emails = (members.json() as { members: { email: string; roles: string[] }[] }).members.map((m) => m.email).sort();
      expect(emails).toEqual(["artist@sunburst.gg", "director@sunburst.gg", "env@sunburst.gg", "producer@sunburst.gg", "viewer@sunburst.gg"]);
      const denied = await h.app.inject({ method: "POST", url: `/projects/${h.seeded.project_id}/members`, ...h.as(AD), payload: { email: "new@sunburst.gg", name: "New artist", roles: ["artist"] } });
      expect(denied.statusCode).toBe(403);
      const invited = await h.app.inject({ method: "POST", url: `/projects/${h.seeded.project_id}/members`, ...h.as(PRODUCER), payload: { email: "new@sunburst.gg", name: "New artist", roles: ["artist"] } });
      expect(invited.statusCode).toBe(201);
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
