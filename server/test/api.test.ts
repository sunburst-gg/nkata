import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasInfra, startHarness, type Harness } from "./helpers.js";

const ARTIST = "artist@sunburst.gg";
const AD = "director@sunburst.gg";
const PRODUCER = "producer@sunburst.gg";
const ENGINEER = "engineer@sunburst.gg";

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
    const body = res.json() as { asset: { state: string }; parts: { name: string; state: string; mapping: { kind: string } }[] };
    expect(body.parts.map((p) => p.name)).toEqual(["concept", "face", "cloth", "hair", "textures", "rig", "lookdev"]);
    expect(body.parts.find((p) => p.name === "textures")?.state).toBe("locked");
    expect(body.parts.find((p) => p.name === "face")?.state).toBe("draft");
    expect(body.parts.find((p) => p.name === "lookdev")?.mapping).toEqual({ kind: "ue_asset", path: "/Game/Characters/Ojukwu/lookdev" });
    expect(body.asset.state).toBe("draft");
  });

  it("seeds three props and one level area for the environment artist", async () => {
    const res = await h.app.inject({ method: "GET", url: `/assets?project_id=${h.seeded.project_id}`, ...h.as(ARTIST) });
    const names = (res.json() as { assets: { name: string }[] }).assets.map((a) => a.name).sort();
    expect(names).toEqual(["Enugu Market / square", "Kettle", "Market stall", "Ojukwu", "Wooden stool"]);
    const kettle = await h.app.inject({ method: "GET", url: `/assets/${h.seeded.assets["Kettle"]}`, ...h.as(ARTIST) });
    const kettleParts = (kettle.json() as { parts: { name: string; mapping: unknown }[] }).parts;
    expect(kettleParts.map((p) => p.name)).toEqual(["concept", "model", "uvs", "textures", "lods", "collision"]);
    expect(kettleParts.find((p) => p.name === "lods")?.mapping).toEqual({ kind: "ue_asset", path: "/Game/Props/Kettle" });
    const square = await h.app.inject({ method: "GET", url: `/assets/${h.seeded.assets["Enugu Market / square"]}`, ...h.as(ARTIST) });
    const squareParts = (square.json() as { parts: { name: string; state: string; mapping: unknown }[] }).parts;
    expect(squareParts.map((p) => p.name)).toEqual(["blockout", "layout", "set_dressing", "lighting"]);
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
      expect((await h.app.inject({ method: "POST", url: `/parts/${parts["face"]}/lock`, ...h.as(ENGINEER) })).statusCode).toBe(403);
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
      expect((mirror.json() as { version: { mirror_status: string; mirror_ms: number } }).version).toMatchObject({ mirror_status: "synced", mirror_ms: 4200 });
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
      const denied = await h.app.inject({ method: "POST", url: "/reviews", ...h.as(ENGINEER), payload: { part_id: parts["face"], version_id: faceVersion, score: 5, decision: "approve" } });
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
});
