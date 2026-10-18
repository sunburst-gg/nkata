// Two machines, one project, against the test server make test starts (NKATA_TEST_SERVER_URL,
// seeded, NKATA_DEV so the sign in code comes back in the response). Machine A is the artist's
// agent posting a save; machine B is a lead's desktop polling events. Then an invite from B, a
// sign in on a third machine, and B's strip walking Invited, Joined, Blender.
import { describe, expect, it } from "vitest";
import type { DataEvent } from "../DataSource";
import { LiveDataSource } from "./LiveDataSource";

const SERVER = process.env["NKATA_TEST_SERVER_URL"] ?? "";
const ARTIST = "env@sunburst.gg";
const PRODUCER = "producer@sunburst.gg";

const agent = {
  status: async () => ({ running: false, mode: null, project_id: null, folder: null, port: null }),
  startSync: async () => ({ running: true, mode: "sync" as const, project_id: "", folder: "", port: 7420 }),
  startStream: async () => ({ running: true, mode: "stream" as const, project_id: "", folder: null, port: 7420 }),
  stop: async () => ({ running: false, mode: null, project_id: null, folder: null, port: null }),
  toolsDetect: async () => ({ blender: null, uprojects: [], addon_shipped: false, plugin_shipped: false }),
  toolsInstallBlender: async () => "",
  openInBlender: async () => "",
  openVersion: async () => "",
  downloadFile: async () => "",
  listBlendFiles: async () => [],
};

async function signIn(email: string): Promise<{ source: LiveDataSource; token: string }> {
  const source = new LiveDataSource({ serverUrl: SERVER, token: "", agent, pollMs: 0 });
  const sent = await source.requestCode(email);
  if (!sent.code) throw new Error("the test server must run with NKATA_DEV=1 so the code comes back");
  await source.redeemCode(email, sent.code);
  const res = await fetch(`${SERVER}/auth/magic-link`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
  const link = (await res.json()) as { link: string };
  const token = new URL(link.link).searchParams.get("token")!;
  const session = await fetch(`${SERVER}/auth/callback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
  return { source, token: ((await session.json()) as { token: string }).token };
}

async function api<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${SERVER}${path}`, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `${method} ${path} ${res.status}`);
  return json;
}

const manifest = { v: 1, kind: "prop", objects: [{ name: "Kettle", triangles: 4_200, materials: ["M_Kettle"], bounds_min: [0, 0, 0], bounds_max: [1, 1, 1], hash: "k1", origin: [0, 0, 0], scale: [1, 1, 1], uv_sets: ["UVMap"] }], bone_count: null, armature: null, mirror_target: null, textures: [], unit_scale: 1 };

describe.skipIf(!SERVER)("two machines, one project", () => {
  it("a save on machine A shows on machine B within one poll, with its owner; then the strip walks Invited, Joined, Blender", async () => {
    const a = await signIn(ARTIST);
    const b = await signIn(PRODUCER);
    const projects = await b.source.listProjects();
    const project = projects[0]!;
    const events: DataEvent[] = [];
    b.source.subscribe((e) => events.push(e));
    const wall = await b.source.listAssets(project.id);
    const kettle = wall.find((x) => x.name === "Kettle")!;
    expect(kettle.owner.first).toBe("Environment");
    await b.source.poll(project.id);
    events.length = 0;

    // Machine A: the artist's agent posts the save the add-on made.
    const detail = await api<{ parts: { id: string }[] }>(a.token, "GET", `/assets/${kettle.id}`);
    const partId = detail.parts[0]!.id;
    const t0 = Date.now();
    await api(a.token, "POST", `/parts/${partId}/versions`, { manifest, mirror_status: "skipped", note: "" });
    await b.source.poll(project.id);
    const saved = events.find((e) => e.type === "saved");
    expect(saved).toMatchObject({ type: "saved", assetId: kettle.id, by: a.source.me!.id });
    expect(Date.now() - t0).toBeLessThan(5_000);
    const after = (await b.source.getAsset(kettle.id))!;
    expect(after.live).toBeDefined();
    expect(after.versions[0]!.facts?.tris).toBe(4_200);
    expect(after.versions[0]!.checks.find((c) => c.key === "tris")).toMatchObject({ pass: true });
    expect(after.versions[0]!.checks.filter((c) => c.pending)).toHaveLength(3);

    // Publish from A's desktop with a note; B sees the Version and approves it.
    await a.source.listAssets(project.id);
    await a.source.publish(kettle.id, "Spout reshaped.");
    await b.source.poll(project.id);
    expect(events.map((e) => e.type)).toContain("published");
    const published = (await b.source.getAsset(kettle.id))!;
    expect(published.versions[0]).toMatchObject({ n: 1, note: "Spout reshaped.", approved: false });
    expect((await b.source.listMentions(project.id)).some((m) => m.asset.id === kettle.id && m.verb === "published, for you to approve")).toBe(true);
    await b.source.approve(kettle.id, 1);
    expect((await b.source.getAsset(kettle.id))!.versions[0]!.approved).toBe(true);
    await a.source.poll(project.id);

    // Invite from B, sign in on C, name, heartbeat: B's strip walks Invited, Joined, Blender.
    const email = `bisi-${Date.now()}@sunburst.gg`;
    const invited = await b.source.invite(project.id, email, "artist");
    expect(invited.journey).toBe("invited");
    const journeyOf = async () => (await b.source.listMembers(project.id)).find((m) => m.person.email === email)?.journey;
    expect(await journeyOf()).toBe("invited");
    const c = await signIn(email);
    expect(await journeyOf()).toBe("invited");
    await c.source.setMe("Bisi Ade");
    expect(await journeyOf()).toBe("joined");
    await api(c.token, "POST", "/presence", { v: 1, project_id: project.id, part_id: partId });
    await b.source.poll(project.id);
    expect(["blender", "inBlender"]).toContain(await journeyOf());
    expect(events.some((e) => e.type === "presence" && e.personId === c.source.me!.id)).toBe(true);
  });
});
