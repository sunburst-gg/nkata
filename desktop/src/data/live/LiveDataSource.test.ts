// The live source against a fake server: a route table in place of fetch. Covers the account,
// the wall load, the three decisions, comments, the event poll and the offline line.
import { describe, expect, it, vi } from "vitest";
import type { DataEvent } from "../DataSource";
import { LiveDataSource } from "./LiveDataSource";

const NOW = new Date("2026-10-18T12:00:00Z");
const ada = { id: "01ADA000000000000000000000", name: "Ada Okafor", avatar_url: null };
const emeka = { id: "01EMEKA00000000000000000000", name: "Emeka Nnamdi", avatar_url: null };
const PROJECT = "01PROJECT0000000000000000";
const manifest = { objects: [{ name: "Body", triangles: 12_000, materials: [], hash: "x", uv_sets: ["UVMap"] }], textures: [], unit_scale: 1 };

type Route = (body: unknown, url: URL) => unknown;

function fakeServer(opts: { conceptFirst?: boolean } = {}) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const events: { id: string; event: Record<string, unknown> }[] = [];
  let online: unknown[] = [];
  let reviews: unknown[] = [];
  let comments: unknown[] = [];
  let versions = [
    { id: "v1", part_id: "p1", author_id: ada.id, published: true, note: "First pass.", created_at: "2026-10-10T10:00:00Z", manifest, render_url: "https://x/v1.png", model_url: "https://x/v1.glb" },
    { id: "v2", part_id: "p1", author_id: ada.id, published: false, note: "", created_at: "2026-10-18T11:30:00Z", manifest, render_url: null, model_url: "https://x/v2.glb" },
  ];
  const routes: Record<string, Route> = {
    "GET /auth/me": () => ({ user: emeka, email: "emeka@sunburst.studio", studio_id: "st1", roles: ["producer"], studios: [{ id: "st1", name: "Sunburst", roles: ["producer"] }] }),
    "GET /studio": () => ({ studio: { id: "st1", name: "Sunburst", training: "on" } }),
    "GET /projects": () => ({ projects: [{ id: PROJECT, name: "Rising Sun", folder_name: "rising-sun", created_at: "2026-10-01T00:00:00Z", color: "var(--p-teal)" }] }),
    [`GET /projects/${PROJECT}/budgets`]: () => ({ budgets: { prop: 30000, vehicle: 60000, character: 80000, environment: 2000000, max_texture: null } }),
    "GET /assets": () => ({ assets: [{ id: "a1", name: "Radio", template_id: "t", state: "draft", updated_at: "2026-10-18T11:00:00Z", kind: "object", group: "Props", budget: null }] }),
    "GET /assets/a1": () => ({ parts: [...(opts.conceptFirst ? [{ id: "p0", asset_id: "a1", name: "concept", owner: ada, owner_id: ada.id, state: "draft", mapping: { kind: "file" }, updated_at: "2026-10-18T09:00:00Z", lock: null }] : []), { id: "p1", asset_id: "a1", name: "model", owner: ada, owner_id: ada.id, state: "draft", mapping: { kind: "blend_collection", file: "Radio/Radio.blend" }, updated_at: "2026-10-18T11:00:00Z", lock: null }] }),
    "GET /studio/members": () => ({ members: [{ user: emeka, email: "emeka@sunburst.studio", roles: ["producer"] }, { user: ada, email: "ada@sunburst.studio", roles: ["artist"] }, { user: { id: "01NEW", name: "", avatar_url: null }, email: "new@studio.com", roles: ["artist"] }] }),
    "GET /presence": () => ({ online }),
    "GET /parts/p1/versions": () => ({ versions }),
    "GET /reviews": () => ({ reviews }),
    "GET /parts/p1/comments": () => ({ comments }),
    "GET /parts/p1/versions/v2/checks": () => ({ results: [] }),
    "GET /parts/p1/versions/v1/checks": () => ({ results: [] }),
    "GET /events": (_b, url) => { const since = url.searchParams.get("since"); const out = since ? events.filter((e) => e.id > since) : events; return { events: out, next: out.at(-1)?.id ?? since ?? null }; },
    "POST /parts/p1/publish": (b) => { versions = versions.map((v) => (v.id === (b as { version_id: string }).version_id ? { ...v, published: true, note: (b as { note: string }).note } : v)); return { ok: true }; },
    "POST /reviews": (b) => { const r = { id: "r1", ...(b as object), reviewer_id: emeka.id, created_at: "2026-10-18T12:00:00Z" }; reviews = [...reviews, r]; return { review: r }; },
    "POST /comments/c1/resolve": () => { comments = comments.map((c) => ((c as { id: string }).id === "c1" ? { ...(c as object), resolved_at: "2026-10-18T12:01:00Z" } : c)); return { comment: comments[0] }; },
    "POST /comments/c1/reopen": () => { comments = comments.map((c) => ((c as { id: string }).id === "c1" ? { ...(c as object), resolved_at: null } : c)); return { comment: comments[0] }; },
    "POST /comments": (b) => { const c = { id: `c${comments.length + 1}`, part_id: "p1", version_id: (b as { version_id: string }).version_id, author: emeka, body: (b as { body: string }).body, kind: "pin", point: (b as { point: number[] }).point, created_at: "2026-10-18T12:00:00Z" }; comments = [...comments, c]; return { comment: c }; },
    [`POST /projects/${PROJECT}/members`]: (b) => ({ member: { user: { id: "01INV", name: "", avatar_url: null }, email: (b as { email: string }).email, roles: (b as { roles: string[] }).roles } }),
    "PUT /assets/a1": () => ({ asset: {} }),
    [`PUT /projects/${PROJECT}/budgets`]: (b) => ({ budgets: b }),
    "POST /auth/code": (b) => ((b as { code: string }).code === "123456" ? { token: "tok", user: emeka, email: "emeka@sunburst.studio", studio_id: "st1", roles: ["producer"], studios: [] } : { error: { code: "unauthorized", message: "that code is not right" } }),
  };
  let down = false;
  const fetchImpl = async (input: string, init?: RequestInit): Promise<Response> => {
    if (down) throw new TypeError("fetch failed");
    const url = new URL(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path: url.pathname + url.search, body });
    const route = routes[`${method} ${url.pathname}`];
    if (!route) return new Response(JSON.stringify({ error: { code: "not_found", message: `no route ${method} ${url.pathname}` } }), { status: 404 });
    const out = route(body, url) as { error?: unknown };
    return new Response(JSON.stringify({ v: 1, ...out }), { status: out.error ? 401 : 200, headers: { "content-type": "application/json" } });
  };
  return { fetchImpl, calls, events, setOnline: (o: unknown[]) => { online = o; }, setDown: (d: boolean) => { down = d; } };
}

const agent = {
  status: async () => ({ running: true, mode: "sync" as const, project_id: PROJECT, folder: "/Users/emeka/Nkata/Rising Sun", port: 7420 }),
  startSync: async () => ({ running: true, mode: "sync" as const, project_id: PROJECT, folder: "/x", port: 7420 }),
  startStream: async () => ({ running: true, mode: "stream" as const, project_id: PROJECT, folder: null, port: 7420 }),
  stop: async () => ({ running: false, mode: null, project_id: null, folder: null, port: null }),
  toolsDetect: async () => ({ blender: { exe: "/Applications/Blender.app", version: "4.2.3" }, uprojects: [], addon_shipped: true, plugin_shipped: false }),
  toolsInstallBlender: async () => "installed",
  openInBlender: async () => "opened",
  openVersion: async () => "opened",
  downloadFile: async () => "/tmp/x",
  listBlendFiles: async () => [],
  placeFor: async (folder: string) => folder,
};

async function booted() {
  const server = fakeServer();
  const source = new LiveDataSource({ serverUrl: "http://server", token: "tok", folder: "/Users/emeka/Nkata/Rising Sun", fetch: server.fetchImpl, now: () => NOW, agent, pollMs: 0 });
  const events: DataEvent[] = [];
  source.subscribe((e) => events.push(e));
  await source.loadAccount();
  return { server, source, events };
}

describe("LiveDataSource", () => {
  it("log out stops the background process and forgets the place, so the next person never syncs into it", async () => {
    // The place had outlived Log out: the next account's project read as "on this computer" at the
    // last person's folder, and the agent pulled the new studio's files into it.
    const server = fakeServer();
    const stop = vi.fn(agent.stop);
    const source = new LiveDataSource({ serverUrl: "http://server", token: "tok", folder: "/Users/emeka/Documents", fetch: server.fetchImpl, now: () => NOW, agent: { ...agent, stop }, pollMs: 0 });
    await source.loadAccount();
    await source.listAssets(PROJECT);
    expect(source.projectFolder(PROJECT)).toBe("/Users/emeka/Documents");
    await source.signOut();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(source.projectFolder(PROJECT)).toBeNull();
    expect(source.projectFolder("01OTHERPROJECT0000000000000")).toBeNull();
  });

  it("shows the part Blender saves into when an asset has a concept part first", async () => {
    // A template asset (the seed, older projects) lists concept before model; the saves land on
    // model, so parts[0] read as "No save yet" for an asset with Versions.
    const server = fakeServer({ conceptFirst: true });
    const source = new LiveDataSource({ serverUrl: "http://server", token: "tok", folder: "/Users/emeka/Nkata/Rising Sun", fetch: server.fetchImpl, now: () => NOW, agent, pollMs: 0 });
    await source.loadAccount();
    const assets = await source.listAssets(PROJECT);
    expect(assets[0]!.versions.map((v) => v.n)).toEqual([2, 1]);
    expect(server.calls.some((c) => c.path.startsWith("/parts/p0/"))).toBe(false);
  });

  it("loads the account, the studio, the projects and the wall", async () => {
    const { source } = await booted();
    expect(source.me).toMatchObject({ first: "Emeka", role: "producer", email: "emeka@sunburst.studio" });
    expect(await source.getStudio()).toEqual({ id: "st1", name: "Sunburst", training: true });
    expect(await source.listProjects()).toEqual([{ id: PROJECT, name: "Rising Sun", color: "var(--p-teal)" }]);
    const assets = await source.listAssets(PROJECT);
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({ name: "Radio", group: "Props", glb: "https://x/v2.glb", render: "https://x/v1.png", live: { savedAt: "30 min ago" } });
    expect(assets[0]!.versions.map((v) => v.n)).toEqual([2, 1]);
    expect(assets[0]!.versions[0]!.checks.find((c) => c.key === "tris")).toMatchObject({ pass: true });
    const members = await source.listMembers(PROJECT);
    expect(members.map((m) => [m.person.first, m.journey])).toEqual([["Emeka", "joined"], ["Ada", "joined"], ["new", "invited"]]);
  });

  it("publishes, approves, requests changes with a line, comments; each emits its event", async () => {
    const { source, events, server } = await booted();
    await source.listAssets(PROJECT);
    await expect(source.publish("a1", "   ")).rejects.toThrow("Write one line first.");
    await source.publish("a1", "Dial added.");
    expect(server.calls.find((c) => c.path === "/parts/p1/publish")?.body).toMatchObject({ version_id: "v2", note: "Dial added.", ready: true });
    expect((await source.getAsset("a1"))!.versions[0]).toMatchObject({ n: 2, note: "Dial added." });
    await source.approve("a1", 2);
    expect(server.calls.find((c) => c.path === "/reviews")?.body).toMatchObject({ part_id: "p1", version_id: "v2", decision: "approve" });
    expect((await source.getAsset("a1"))!.versions[0]!.approved).toBe(true);
    await expect(source.requestChanges("a1", 2)).rejects.toThrow("Pin the spot or write one line first.");
    const c = await source.comment("a1", "Loosen the ridge.", [0.1, 0.2, 0.3]);
    expect(c).toMatchObject({ assetId: "a1", version: 2, text: "Loosen the ridge.", pin: [0.1, 0.2, 0.3] });
    await source.requestChanges("a1", 2);
    expect(server.calls.filter((c) => c.path === "/reviews").at(-1)?.body).toMatchObject({ decision: "send_back", note: "Loosen the ridge." });
    expect(events.map((e) => e.type)).toEqual(["published", "approved", "commented", "changesRequested"]);
    await source.resolveComment("a1", "c1", true);
    expect((await source.listComments("a1")).find((x) => x.id === "c1")?.done).toBe(true);
    await source.resolveComment("a1", "c1", false);
    expect((await source.listComments("a1")).find((x) => x.id === "c1")?.done).toBeUndefined();
    expect(events.slice(-2).map((e) => e.type)).toEqual(["commented", "commented"]);
  });

  it("an event fetches only what it touched: presence nothing, a save its own asset, an unknown asset the project", async () => {
    const { source, server } = await booted();
    await source.listAssets(PROJECT);
    const fetched = () => server.calls.filter((c) => c.method === "GET" && !c.path.startsWith("/events")).map((c) => c.path.split("?")[0]);
    server.calls.length = 0;
    server.events.push({ id: "01E1", event: { v: 1, kind: "presence.changed", project_id: PROJECT, actor_id: ada.id, at: "2026-10-18T11:59:30Z", online: [{ user: ada, part_id: "p1", since: "2026-10-18T11:00:00Z", last_seen: "2026-10-18T11:59:30Z" }] } });
    await source.poll(PROJECT);
    expect(fetched()).toEqual([]);
    expect((await source.getAsset("a1"))!.live).toBeDefined();
    server.calls.length = 0;
    server.events.push({ id: "01E2", event: { v: 1, kind: "version.created", project_id: PROJECT, actor_id: ada.id, at: "2026-10-18T12:00:00Z", part_id: "p1", version_id: "v2", published: false } });
    await source.poll(PROJECT);
    expect(fetched()).not.toContain("/studio/members");
    expect(fetched().filter((p) => p === "/assets")).toHaveLength(1);
    expect(fetched()).toContain("/assets/a1");
    server.calls.length = 0;
    server.events.push({ id: "01E3", event: { v: 1, kind: "version.created", project_id: PROJECT, actor_id: ada.id, at: "2026-10-18T12:01:00Z", part_id: "p-new", version_id: "v9", published: false } });
    await source.poll(PROJECT);
    expect(fetched()).toContain("/studio/members");
  });

  it("relays server events as DataEvents and keeps its cursor", async () => {
    const { source, events, server } = await booted();
    await source.listAssets(PROJECT);
    await source.poll(PROJECT);
    expect(events).toEqual([]);
    server.events.push({ id: "01E1", event: { v: 1, kind: "version.created", project_id: PROJECT, actor_id: ada.id, at: "2026-10-18T11:59:00Z", part_id: "p1", version_id: "v2", published: false } });
    server.events.push({ id: "01E2", event: { v: 1, kind: "presence.changed", project_id: PROJECT, actor_id: ada.id, at: "2026-10-18T11:59:30Z", online: [{ user: ada, part_id: "p1", since: "2026-10-18T11:00:00Z", last_seen: "2026-10-18T11:59:30Z" }] } });
    await source.poll(PROJECT);
    expect(events.map((e) => e.type)).toEqual(["saved", "presence"]);
    expect(events[1]).toMatchObject({ type: "presence", personId: ada.id, file: "Radio/Radio.blend" });
    server.setOnline([{ user: ada, part_id: "p1", since: "2026-10-18T11:00:00Z", last_seen: "2026-10-18T11:59:30Z" }]);
    await source.poll(PROJECT);
    expect(events).toHaveLength(2);
    const since = server.calls.filter((c) => c.path.startsWith("/events")).at(-1)?.path;
    expect(since).toContain("since=01E2");
    expect((await source.listMembers(PROJECT)).find((m) => m.person.first === "Ada")?.journey).toBe("inBlender");
  });

  it("the first poll after sign in catches up quietly: an old approval is not news", async () => {
    // Signing in replayed the project's history: "Ngozi approved v2 of Kettle" toasted an hour on.
    const { source, events, server } = await booted();
    await source.listAssets(PROJECT);
    server.events.push({ id: "01E0", event: { v: 1, kind: "review.decided", project_id: PROJECT, actor_id: emeka.id, at: "2026-10-18T10:00:00Z", part_id: "p1", version_id: "v1", decision: "approve" } });
    await source.poll(PROJECT);
    expect(events).toEqual([]);
    server.events.push({ id: "01E1", event: { v: 1, kind: "version.created", project_id: PROJECT, actor_id: ada.id, at: "2026-10-18T11:59:00Z", part_id: "p1", version_id: "v2", published: false } });
    await source.poll(PROJECT);
    expect(events.map((e) => e.type)).toEqual(["saved"]);
  });

  it("a lost server reads as offline once, and online once it answers again", async () => {
    const { source, events, server } = await booted();
    await source.listAssets(PROJECT);
    server.setDown(true);
    await expect(source.poll(PROJECT)).rejects.toThrow("Offline");
    await expect(source.poll(PROJECT)).rejects.toThrow("Offline");
    expect(events.filter((e) => e.type === "online")).toEqual([{ type: "online", online: false }]);
    server.setDown(false);
    await source.poll(PROJECT);
    expect(events.filter((e) => e.type === "online")).toEqual([{ type: "online", online: false }, { type: "online", online: true }]);
  });

  it("the code flow: a wrong code says wrong, the right one signs in", async () => {
    const server = fakeServer();
    const source = new LiveDataSource({ serverUrl: "http://server", token: "", fetch: server.fetchImpl, now: () => NOW, agent, pollMs: 0 });
    await expect(source.redeemCode("emeka@sunburst.studio", "000000")).rejects.toThrow("wrong");
    const me = await source.redeemCode("emeka@sunburst.studio", "123456");
    expect(me.first).toBe("Emeka");
    expect(source.signedIn).toBe(true);
  });

  it("Blender on this computer: detect, connect, pause and resume through the agent", async () => {
    const { source, events } = await booted();
    await source.listAssets(PROJECT);
    const stop = vi.spyOn(agent, "stop");
    await source.detectBlender();
    expect(source.blender).toEqual({ kind: "found", version: "4.2.3" });
    await source.connectBlender();
    expect(source.blender).toMatchObject({ kind: "connected", version: "4.2.3" });
    await source.pause();
    expect(stop).toHaveBeenCalled();
    expect(source.blender.kind).toBe("paused");
    await source.resume();
    expect(source.blender.kind).toBe("connected");
    // Connecting Blender says nothing about the project: only a place on this computer does.
    expect(events.map((e) => e.type)).toEqual(["toolDetected", "addonInstalled", "paused", "agent", "resumed"]);
    expect(await source.listLocalProjects()).toEqual([{ projectId: PROJECT, name: "Rising Sun", path: "/Users/emeka/Nkata/Rising Sun", bytes: 0, syncing: true }]);
  });

  it("puts the project on this computer: keeps it in step there, knows the place, ticks the setup row", async () => {
    const server = fakeServer();
    const startSync = vi.fn(agent.startSync);
    const source = new LiveDataSource({ serverUrl: "http://server", token: "tok", folder: null, fetch: server.fetchImpl, now: () => NOW, agent: { ...agent, startSync }, pollMs: 0 });
    const events: DataEvent[] = [];
    source.subscribe((e) => events.push(e));
    await source.loadAccount();
    await source.listAssets(PROJECT);
    expect(source.projectFolder(PROJECT)).toBeNull();
    await expect(source.placeProject(PROJECT, "  ")).rejects.toThrow("Choose where the project lives on this computer.");
    await source.placeProject(PROJECT, "~/Nkata/Rising Sun");
    expect(startSync).toHaveBeenCalledWith("http://server", "tok", PROJECT, "~/Nkata/Rising Sun");
    expect(source.projectFolder(PROJECT)).toBe("~/Nkata/Rising Sun");
    expect(events.map((e) => e.type)).toEqual(["agent", "setup", "localChanged"]);
  });

  it("a picked folder that holds other work gets the project in a folder of its own", async () => {
    const server = fakeServer();
    const startSync = vi.fn(agent.startSync);
    const placeFor = vi.fn(async (folder: string, name: string) => `${folder}/${name}`);
    const source = new LiveDataSource({ serverUrl: "http://server", token: "tok", folder: null, fetch: server.fetchImpl, now: () => NOW, agent: { ...agent, startSync, placeFor }, pollMs: 0 });
    await source.loadAccount();
    await source.placeProject(PROJECT, "/Users/emeka/Documents");
    expect(placeFor).toHaveBeenCalledWith("/Users/emeka/Documents", "Rising Sun", PROJECT);
    expect(startSync).toHaveBeenCalledWith("http://server", "tok", PROJECT, "/Users/emeka/Documents/Rising Sun");
    expect(source.projectFolder(PROJECT)).toBe("/Users/emeka/Documents/Rising Sun");
  });

  it("budgets: setBudgets counts the assets over now; the invite emits memberChanged", async () => {
    const { source, events } = await booted();
    await source.listAssets(PROJECT);
    expect(await source.setBudgets(PROJECT, { prop: 10_000, vehicle: 60_000, character: 80_000, environment: 2_000_000, maxTexture: null })).toBe(0);
    const member = await source.invite(PROJECT, "bisi@studio.com", "artist");
    expect(member).toMatchObject({ journey: "invited", person: { email: "bisi@studio.com", role: "artist" } });
    expect(events.at(-1)).toMatchObject({ type: "memberChanged", personId: "01INV", journey: "invited" });
  });
});
