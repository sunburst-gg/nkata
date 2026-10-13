// The server data source. Everything the screens read comes from the REST routes in
// docs/engineering.md, Protocols, and refreshes on every WebSocket event. Every mutation is one
// route. The mock in mock.ts keeps the same DataSource shape for screenshots and tests.
import type { Role } from "@/auth/permissions";
import { ROLE_WORDS } from "@/auth/permissions";
import type { ActivityItem, Asset, AssetKind, AssetState, AvatarTone, Check, Comment, Connection, ConnectionId, DataSource, Digest, DigestMove, Mention, Part, PartState, Person, Project, Session, Snapshot, Studio, StudioRef, Template, Version } from "./types";
import { agent } from "@/lib/tauri";
import { askAbout, slugOf as slugOfName } from "./ask";
import { reasonOf } from "@/lib/reason";

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface ServerConfig {
  serverUrl: string;
  token: string;
  projectId: string;
  /** Opens a WebSocket for live updates. Absent in tests. */
  socket?: (url: string, onEvent: (event: Record<string, unknown>) => void) => () => void;
  fetch?: Fetch;
  now?: () => Date;
  /** The local project folder this machine syncs, or null in stream mode. */
  folder: string | null;
  theme: "dark" | "light";
  /** A write the server refused. The reload reverts the screen; this says why. */
  onError?: (message: string) => void;
}

type Wire = Record<string, unknown>;
type UserRef = { id: string; name: string; avatar_url: string | null };
type PartWire = {
  id: string; asset_id: string; asset_name: string; kind: "character" | "prop" | "level_area"; name: string; position: number;
  state: PartState | "locked"; owner: UserRef | null; owner_id: string | null;
  lock: { holder: UserRef; granted_at: string } | null; gate: { after: string[] }; waiting_on: string[];
  checks: { id: string; severity: "block" | "warn"; params: Record<string, unknown> }[]; reference_files: string[];
  mapping: { kind: string; file?: string };
  updated_at: string;
};
type AssetWire = { id: string; name: string; template_id: string; state: string; updated_at: string };
type ManifestWire = { objects: { name: string; triangles: number; materials: string[]; hash: string }[]; bone_count?: number | null } | null;
type VersionWire = { id: string; part_id: string; author_id: string; mirror_status: string; mirror_ms: number | null; refs: { level: string; actors: number }[] | null; published: boolean; note: string; created_at: string; render_url?: string | null; model_url?: string | null; manifest?: ManifestWire };
type CommentWire = { id: string; part_id: string; author: UserRef; body: string; kind: "pin" | "take_a_look"; point: number[]; resolved_at: string | null; created_at: string };
type CheckWire = { check_id: string; severity: "block" | "warn"; passed: boolean; auto_fixed: boolean; message: string };
type EventWire = { id: string; event: Wire & { kind: string; actor_id: string; at: string; part_id?: string } };

const CHECK_WORDS: Record<string, string> = {
  unit_scale: "Scale", name_pattern: "Naming", triangle_budget: "Triangle budget", uv_set_present: "UV set", texture_size: "Texture size",
  rig_bone_names: "Rig names", rig_bone_count: "Rig bone count", metahuman_dna_present: "MetaHuman data", lod_count: "LODs",
  collision_present: "Collision", pivot_at_base: "Pivot at base",
};
const FIXABLE = new Set(["unit_scale", "name_pattern"]);
const KIND_WORD: Record<string, string> = { character: "Character", prop: "Prop", level_area: "Level area" };
const KIND_TAB: Record<string, AssetKind> = { character: "Characters", prop: "Props", level_area: "Levels" };
const ROLE_ORDER: Role[] = ["producer", "art_director", "artist", "viewer"];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function slugOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function toneOf(id: string): AvatarTone {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 8;
  return ((h % 8) + 1) as AvatarTone;
}

/** The role the app acts as: the strongest of the member's roles. */
export function primaryRole(roles: string[]): Role {
  return ROLE_ORDER.find((r) => roles.includes(r)) ?? "viewer";
}

/** "now", "12 min", "2 h", "3 d", in the product's mono labels. */
export function ago(iso: string, now: Date): string {
  const ms = now.getTime() - new Date(iso).getTime();
  if (ms < 60_000) return "now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} h`;
  return `${Math.floor(ms / 86_400_000)} d`;
}

function partState(p: PartWire): PartState {
  if (p.state === "locked") return p.waiting_on.length > 0 ? "waiting" : "locked";
  return p.state;
}

function assetState(parts: Part[]): AssetState {
  if (parts.some((p) => p.checks.some((c) => c.status === "fail" && c.blocks))) return "failed";
  if (parts.length > 0 && parts.every((p) => p.state === "approved")) return "approved";
  if (parts.some((p) => p.state === "draft")) return "draft";
  if (parts.some((p) => p.state === "ready")) return "ready";
  if (parts.some((p) => p.state === "locked" || p.state === "waiting")) return "locked";
  return "draft";
}

export function checkOf(c: CheckWire): Check {
  return {
    id: c.check_id,
    name: CHECK_WORDS[c.check_id] ?? c.check_id,
    detail: c.passed ? (c.auto_fixed ? "Fixed" : "Pass") : c.message,
    status: c.passed ? "pass" : c.severity === "block" ? "fail" : "warn",
    blocks: !c.passed && c.severity === "block",
    fixable: !c.passed && FIXABLE.has(c.check_id),
  };
}

export function versionOf(v: VersionWire, n: number, now: Date): Version {
  return {
    id: v.id, n, note: v.published ? "published" : v.note, render: v.render_url ? { url: v.render_url } : null, authorId: v.author_id, when: ago(v.created_at, now), mirror: v.mirror_status === "failed" ? "failed" : "synced",
    ...(v.model_url ? { model: v.model_url } : {}),
    ...(v.manifest ? { manifest: { objects: v.manifest.objects.map((o) => ({ name: o.name, triangles: o.triangles, materials: [...o.materials], hash: o.hash })), bones: v.manifest.bone_count ?? null } } : {}),
  };
}

export function activityOf(e: EventWire, people: Map<string, Person>, parts: Map<string, { assetSlug: string; assetName: string; partName: string }>, now: Date): ActivityItem | null {
  const ev = e.event;
  const where = ev.part_id ? parts.get(ev.part_id) : undefined;
  const target = where ? `${where.assetName} / ${where.partName}` : "";
  const base = { id: e.id, personId: ev.actor_id, when: ago(ev.at, now), assetSlug: where?.assetSlug ?? "", partName: where?.partName };
  switch (ev.kind) {
    case "version.created":
      return { ...base, text: ev.published ? "published." : "saved.", target, dot: ev.published ? "approved" : "synced" };
    case "part.state":
      return { ...base, text: ev.to === "ready" ? "marked Ready." : ev.to === "approved" ? "approved. Locked." : ev.to === "draft" && ev.from === "locked" ? "opened. Gate passed." : "sent back.", target, dot: ev.to === "ready" ? "ready" : ev.to === "approved" ? "approved" : "draft" };
    case "review.decided":
      return { ...base, text: ev.decision === "approve" ? `approved, ${String(ev.score)} of 5.` : `sent back, ${String(ev.score)} of 5.`, target, dot: ev.decision === "approve" ? "approved" : "failed" };
    case "comment.created": {
      const c = ev.comment as CommentWire | undefined;
      const w = c ? parts.get(c.part_id) : undefined;
      return { ...base, personId: c?.author.id ?? ev.actor_id, text: "left a note.", target: w ? `${w.assetName} / ${w.partName}` : target, dot: "muted", assetSlug: w?.assetSlug ?? "", partName: w?.partName };
    }
    case "lock.granted":
      return { ...base, text: "opened. Lock started.", target, dot: "locked" };
    case "mirror.result":
      return ev.status === "failed" ? { ...base, text: "did not reach Unreal.", target, dot: "failed" } : null;
    case "gate.opened":
      return { ...base, text: "gate passed.", target, dot: "draft" };
    default:
      return null;
  }
}

/** The two latest weeks from the event stream: what changed, what moved, who said what. */
export function digestsOf(events: EventWire[], assets: Asset[], people: Map<string, Person>, now: Date): Digest[] {
  const partIndex = new Map<string, { asset: Asset; part: Part }>();
  for (const a of assets) for (const p of a.parts) partIndex.set(p.id, { asset: a, part: p });
  const out: Digest[] = [];
  for (let w = 0; w < 2; w++) {
    const end = now.getTime() - w * WEEK_MS;
    const start = end - WEEK_MS;
    const inWeek = events.filter((e) => { const t = new Date(e.event.at).getTime(); return t > start && t <= end; });
    const moves: DigestMove[] = [];
    for (const e of inWeek) {
      if (e.event.kind !== "part.state") continue;
      const where = partIndex.get(String(e.event.part_id));
      if (!where) continue;
      const toState = (s: string): AssetState => (s === "locked" ? "locked" : (s as AssetState));
      moves.push({ assetSlug: where.asset.slug, name: `${where.asset.name} / ${where.part.name}`, from: toState(String(e.event.from)), to: toState(String(e.event.to)), when: ago(e.event.at, now), render: null });
    }
    const notes = inWeek.filter((e) => e.event.kind === "comment.created").map((e) => {
      const c = e.event.comment as CommentWire;
      const where = partIndex.get(c.part_id);
      return { personId: c.author.id, on: where ? `${where.asset.name} / ${where.part.name}` : "", when: ago(c.created_at, now), text: c.body };
    });
    const label = new Date(start + 1).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
    out.push({ weekLabel: `Week of ${label}`, changed: inWeek.filter((e) => e.event.kind === "version.created").length, moved: moves.length, notes: notes.length, renderPairs: [], moves, weekNotes: notes, hasPrevious: w === 0, hasNext: w === 1 });
  }
  void people;
  return out;
}

export function createServerSource(config: ServerConfig): DataSource & { load(): Promise<void>; signInWithToken(token: string): void } {
  const fetchImpl: Fetch = config.fetch ?? ((input, init) => fetch(input, init));
  const now = config.now ?? (() => new Date());
  const listeners = new Set<() => void>();
  let token = config.token;
  let snapshot: Snapshot = emptySnapshot(config.theme);
  let digestIndex = 0;
  let digestHome = true;
  let stopSocket: (() => void) | null = null;
  let connections: Connection[] = [];
  // Tools come from the agent on this machine, not the server. Absent outside Tauri.
  async function refreshConnections(): Promise<void> {
    try {
      const report = await agent.toolsDetect(config.folder ?? "");
      connections = connectionsOf({ blender: report.blender?.version ?? null, unreal: report.uprojects.length > 0 ? "project found" : null, blenderConnected: false, unrealConnected: false });
    } catch {
      connections = connectionsOf({ blender: null, unreal: null, blenderConnected: false, unrealConnected: false });
    }
  }
  let reloadTimer: ReturnType<typeof setTimeout> | null = null;
  const emit = () => listeners.forEach((fn) => fn());

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetchImpl(`${config.serverUrl}${path}`, { method, headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = (await res.json()) as T & { error?: { code: string; message: string } };
    if (!res.ok) throw new Error(json.error?.message ?? `${method} ${path} answered ${res.status}`);
    return json;
  }

  async function load(): Promise<void> {
    const t = now();
    const me = await call<{ user: UserRef; email: string; studio_id: string | null; roles: string[]; studios: { id: string; name: string; roles: string[] }[] }>("GET", "/auth/me");
    const studios: StudioRef[] = me.studios.map((s) => ({ id: s.id, name: s.name, roles: [primaryRole(s.roles)] }));
    if (!me.studio_id) {
      // An account with no studio yet: the Name and Create studio screens read this.
      const role = primaryRole(me.roles);
      const user: Person = { id: me.user.id, name: me.user.name, initial: me.user.name.charAt(0).toUpperCase(), tone: toneOf(me.user.id), title: ROLE_WORDS[role], role, email: me.email, presence: "online", where: "", seen: "now" };
      snapshot = { ...emptySnapshot(snapshot.session.theme), session: { user, studio: emptySnapshot(snapshot.session.theme).session.studio, studios, theme: snapshot.session.theme, digestHome }, people: [user], connections };
      emit();
      return;
    }
    // Before the studio has a project the session is scoped to the studio alone (DECISIONS.md).
    const scoped = config.projectId !== "";
    const [studio, projects, members, online, assetsWire, templatesWire, eventsWire] = await Promise.all([
      call<{ studio: { id: string; name: string; member_count: number; training: "on" | "off"; billing: { line: string; seats: number } } }>("GET", "/studio"),
      call<{ projects: Wire[] }>("GET", "/projects"),
      call<{ members: { user: UserRef; email: string; roles: string[] }[] }>("GET", "/studio/members"),
      scoped ? call<{ online: { user: UserRef; part_id: string | null; last_seen: string }[] }>("GET", `/presence?project_id=${config.projectId}`) : Promise.resolve({ online: [] }),
      scoped ? call<{ assets: AssetWire[] }>("GET", `/assets?project_id=${config.projectId}`) : Promise.resolve({ assets: [] }),
      scoped ? call<{ templates: { id: string; name: string; schema: { kind: "character" | "prop" | "level_area"; parts: { name: string; gate?: string[]; checks: string[] }[] } }[] }>("GET", `/projects/${config.projectId}/templates`) : Promise.resolve({ templates: [] }),
      scoped ? call<{ events: EventWire[] }>("GET", `/events?project_id=${config.projectId}&limit=1000`) : Promise.resolve({ events: [] }),
    ]);
    const presenceById = new Map(online.online.map((o) => [o.user.id, o]));
    const people: Person[] = members.members.map((m) => {
      const role = primaryRole(m.roles);
      const p = presenceById.get(m.user.id);
      return { id: m.user.id, name: m.user.name, initial: m.user.name.charAt(0).toUpperCase(), tone: toneOf(m.user.id), title: ROLE_WORDS[role], role, email: m.email, presence: p ? "online" : "offline", where: "", seen: p ? ago(p.last_seen, t) : "" };
    });
    const peopleById = new Map(people.map((p) => [p.id, p]));
    const templateKind = new Map(templatesWire.templates.map((tp) => [tp.id, tp.schema.kind]));
    const templateName = new Map(templatesWire.templates.map((tp) => [tp.id, tp.name]));
    const assets: Asset[] = [];
    const projectSlugOf = slugOf(String((projects.projects.find((p) => p["id"] === config.projectId) ?? {})["name"] ?? ""));
    const partIndex = new Map<string, { assetSlug: string; assetName: string; partName: string }>();
    const details = await Promise.all(assetsWire.assets.map((a) => call<{ parts: PartWire[] }>("GET", `/assets/${a.id}`)));
    for (const [i, a] of assetsWire.assets.entries()) {
      const slug = slugOf(a.name);
      const kind = templateKind.get(a.template_id) ?? "prop";
      const partsWire = details[i]!.parts;
      const parts: Part[] = await Promise.all(partsWire.map(async (pw) => {
        partIndex.set(pw.id, { assetSlug: slug, assetName: a.name, partName: pw.name });
        const [versionsRes, commentsRes] = await Promise.all([call<{ versions: VersionWire[] }>("GET", `/parts/${pw.id}/versions`), call<{ comments: CommentWire[] }>("GET", `/parts/${pw.id}/comments`)]);
        const versions = versionsRes.versions.map((v, idx, all) => versionOf(v, all.length - idx, t));
        const current = versionsRes.versions[0];
        const checks: Check[] = current ? (await call<{ results: CheckWire[] }>("GET", `/parts/${pw.id}/versions/${current.id}/checks`)).results.map(checkOf) : [];
        const comments: Comment[] = commentsRes.comments.map((c, n) => ({ id: c.id, n: n + 1, authorId: c.author.id, partName: pw.name, when: ago(c.created_at, t), text: c.body, resolved: c.resolved_at !== null, kind: c.kind ?? "pin", source: "Nkata", ...((c.point ?? []).some((x) => x !== 0) ? { pos: [c.point?.[0] ?? 0, c.point?.[1] ?? 0, c.point?.[2] ?? 0] as [number, number, number] } : {}) }));
        const mirror = !current ? { state: "offline" as const, seconds: 0 } : current.mirror_status === "failed" ? { state: "failed" as const, seconds: 0 } : current.mirror_status === "synced" || current.mirror_status === "skipped" ? { state: "synced" as const, seconds: Math.round((current.mirror_ms ?? 0) / 1000) } : { state: "syncing" as const, seconds: 0 };
        return { id: pw.id, name: pw.name, state: partState(pw), ownerId: pw.owner_id ?? "", render: versions.find((x) => x.render)?.render ?? null, lock: pw.lock ? { holderId: pw.lock.holder.id, since: ago(pw.lock.granted_at, t) } : null, gate: pw.waiting_on, versions, checks, comments, mirror, refs: current?.refs ?? [], file: pw.mapping.kind === "blend_collection" ? pw.mapping.file ?? null : null };
      }));
      const usedIn = [...new Set(parts.flatMap((p) => p.refs.map((r) => r.level.split("/").pop() ?? r.level)))];
      const present = online.online.filter((o) => o.part_id && partsWire.some((p) => p.id === o.part_id)).map((o) => o.user.id);
      const latest = partsWire.map((p) => p.updated_at).sort().at(-1) ?? a.updated_at;
      const ownerName = peopleById.get(parts[0]?.ownerId ?? "")?.name.split(" ")[0] ?? "";
      // The asset's picture and model: the newest render and GLB across its parts.
      const shown = parts.map((p) => p.versions.find((v) => v.render || v.model)).find(Boolean);
      const model = parts.map((p) => p.versions.find((v) => v.model)?.model).find(Boolean);
      assets.push({ id: a.id, slug, projectSlug: projectSlugOf, name: a.name, kind: KIND_TAB[kind] ?? "Props", state: assetState(parts), render: shown?.render ?? null, ...(model ? { model } : {}), noRenderText: parts.map((p) => p.name).join(" · "), meta: `${KIND_WORD[kind] ?? kind} · ${parts.length} part${parts.length === 1 ? "" : "s"}${ownerName ? ` · ${ownerName}` : ""}`, ownerId: parts[0]?.ownerId ?? "", present, parts, template: templateName.get(a.template_id) ?? "", usedIn, changedOrder: i, when: `${ago(latest, t)} ago`, syncIssue: parts.some((p) => p.mirror.state === "failed") });
    }
    assets.sort((x, y) => (y.parts.map((p) => p.versions[0]?.when ?? "").join("") > x.parts.map((p) => p.versions[0]?.when ?? "").join("") ? 1 : -1));
    for (const o of online.online) {
      const person = peopleById.get(o.user.id);
      const where = o.part_id ? partIndex.get(o.part_id) : undefined;
      if (person) person.where = where ? `In ${where.assetName} / ${where.partName}` : "On the project view";
    }
    const activity = eventsWire.events.slice().sort((a, b) => b.event.at.localeCompare(a.event.at)).map((e) => activityOf(e, peopleById, partIndex, t)).filter((x): x is ActivityItem => x !== null).slice(0, 60);
    const templates: Template[] = templatesWire.templates.map((tp) => ({
      id: tp.id, name: tp.name, kind: tp.schema.kind, usedBy: assetsWire.assets.filter((a) => a.template_id === tp.id).length, tools: `${KIND_WORD[tp.schema.kind] ?? tp.schema.kind}`,
      parts: tp.schema.parts.map((p, i) => ({ id: `${tp.id}-${i}`, name: p.name, gate: p.gate ?? [], checks: p.checks.map((c) => CHECK_WORDS[c] ?? c), refs: 0 })),
    }));
    const projectWire = projects.projects.find((p) => p["id"] === config.projectId) ?? projects.projects[0] ?? {};
    const owner = people.find((p) => p.role === "producer") ?? people[0];
    const projectList: Project[] = projects.projects.map((p) => ({
      id: String(p["id"]), slug: slugOf(String(p["name"])), name: String(p["name"]), tone: toneOf(String(p["id"])), createdLabel: `Created ${dateLabel(String(p["created_at"] ?? ""))}`, ownerId: owner?.id ?? "",
      assetCount: p["id"] === config.projectId ? assets.length : 0, changed: "", renders: [], present: online.online.map((o) => o.user.id),
      folder: config.folder ?? "", blender: String(p["blender_version"] ?? ""), unreal: String(p["ue_version"] ?? ""), inviteLink: `nkata://join/${String(p["id"])}`, sizeLabel: "",
    }));
    const studioOut: Studio = { id: studio.studio.id, name: studio.studio.name, initial: studio.studio.name.charAt(0).toUpperCase(), peopleCount: people.length, training: studio.studio.training, billing: studio.studio.billing, projects: projectList.sort((a, b) => (a.id === config.projectId ? -1 : b.id === config.projectId ? 1 : 0)) };
    const role = primaryRole(me.roles);
    const user: Person = peopleById.get(me.user.id) ?? { id: me.user.id, name: me.user.name, initial: me.user.name.charAt(0), tone: toneOf(me.user.id), title: ROLE_WORDS[role], role, email: me.email, presence: "online", where: "", seen: "now" };
    const session: Session = { user: { ...user, role }, studio: studioOut, studios, theme: snapshot.session.theme, digestHome };
    const dayAgo = t.getTime() - 86_400_000;
    const weekAgo = t.getTime() - WEEK_MS;
    const saves = eventsWire.events.filter((e) => e.event.kind === "version.created");
    const digests = digestsOf(eventsWire.events, assets, peopleById, t);
    const first = user.name.split(" ")[0] ?? "";
    const mentions: Mention[] = first ? assets.flatMap((a) => a.parts.flatMap((p) => p.comments.filter((c) => c.authorId !== user.id && c.text.includes(first)).map((c) => ({ id: c.id, authorId: c.authorId, on: `${a.name} / ${p.name}`, assetSlug: a.slug, partName: p.name, when: c.when, text: c.text })))) : [];
    snapshot = {
      session, people, assets, activity, templates, digests, digestIndex, connections, mentions, trainingLog: [],
      online: online.online.filter((o) => peopleById.get(o.user.id)?.role !== "viewer").length,
      changedToday: saves.filter((e) => new Date(e.event.at).getTime() > dayAgo).length,
      changedThisWeek: saves.filter((e) => new Date(e.event.at).getTime() > weekAgo).length,
    };
    void projectWire;
    emit();
  }

  function scheduleReload(): void {
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => { reloadTimer = null; void load().catch(() => undefined); }, 400);
  }
  /** A refused write: tell the person, then reload so the screen shows what the server has. */
  function refused(err: unknown): void {
    config.onError?.(reasonOf(err, "The server refused that change."));
    scheduleReload();
  }

  function connect(): void {
    if (!config.socket || stopSocket || !config.projectId) return;
    const url = `${config.serverUrl.replace(/^http/, "ws")}/ws?project=${config.projectId}&token=${encodeURIComponent(token)}`;
    stopSocket = config.socket(url, () => scheduleReload());
  }

  const findPart = (assetSlug: string, partName: string) => {
    const a = snapshot.assets.find((x) => x.slug === assetSlug);
    const p = a?.parts.find((x) => x.name === partName);
    if (!a || !p) throw new Error(`no part ${assetSlug}/${partName}`);
    return { a, p };
  };
  const currentVersion = async (partId: string): Promise<string> => {
    const res = await call<{ versions: VersionWire[] }>("GET", `/parts/${partId}/versions`);
    const v = res.versions[0];
    if (!v) throw new Error("save the part once before this");
    return v.id;
  };

  return {
    snapshot: () => snapshot,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    load: async () => { await refreshConnections(); await load(); connect(); },
    signInWithToken: (t) => { token = t; },
    signIn: () => { /* the server source signs in with a token; see signInWithToken */ },
    signOut: () => { stopSocket?.(); stopSocket = null; token = ""; snapshot = emptySnapshot(snapshot.session.theme); emit(); },
    markReady: (assetSlug, partName) => {
      const { p } = findPart(assetSlug, partName);
      const blocking = p.checks.filter((c) => c.status === "fail" && c.blocks).length;
      if (blocking > 0) return { ok: false, reason: `${blocking} check${blocking > 1 ? "s" : ""} block${blocking > 1 ? "" : "s"}. Fix ${blocking > 1 ? "them" : "it"} in Blender, then mark Ready.` };
      p.state = "ready";
      emit();
      void call("POST", `/parts/${p.id}/state`, { action: "mark_ready" }).then(scheduleReload).catch(refused);
      return { ok: true };
    },
    fixChecks: () => ({ ok: false, reason: "Fix runs in Blender. Open the part there and press Fix." }),
    rollBack: (assetSlug, partName, toVersion) => {
      const { p } = findPart(assetSlug, partName);
      const from = p.versions.find((v) => v.n === toVersion);
      if (!from) throw new Error(`no version v${toVersion}`);
      const top = p.versions[0]?.n ?? 0;
      const made: Version = { id: `pending-${from.id}`, n: top + 1, note: "current", render: null, authorId: snapshot.session.user.id, when: "now", mirror: "synced", from: toVersion };
      p.versions = [made, ...p.versions];
      emit();
      void call("POST", `/parts/${p.id}/rollback`, { version_id: from.id }).then(scheduleReload).catch(refused);
      return made;
    },
    removeGate: (assetSlug, partName) => {
      const { p } = findPart(assetSlug, partName);
      p.gate = [];
      if (p.state === "waiting") p.state = "draft";
      emit();
      void call("POST", `/parts/${p.id}/gate/remove`).then(scheduleReload).catch(refused);
    },
    assignOwner: async (assetSlug, partName, personId) => {
      const { p } = findPart(assetSlug, partName);
      await call("PATCH", `/parts/${p.id}`, { owner_id: personId });
      await load();
    },
    addComment: (assetSlug, partName, text, pos) => {
      const { p } = findPart(assetSlug, partName);
      const n = Math.max(0, ...p.comments.map((c) => c.n)) + 1;
      const c: Comment = { id: `pending-${n}`, n, authorId: snapshot.session.user.id, partName, when: "now", text, resolved: false, kind: "pin", source: "Nkata", ...(pos ? { pos } : {}) };
      p.comments = [...p.comments, c];
      emit();
      void currentVersion(p.id).then((vid) => call("POST", "/comments", { part_id: p.id, version_id: vid, point: pos ?? [0, 0, 0], normal: [0, 0, 1], body: text })).then(scheduleReload).catch(refused);
      return c;
    },
    // Account and studio edits show at once and go to their route; the reload confirms them.
    setMe: (name, email) => {
      snapshot = { ...snapshot, session: { ...snapshot.session, user: { ...snapshot.session.user, name, initial: name.charAt(0).toUpperCase(), email } } };
      emit();
      void call("PUT", "/me", { name, ...(email !== snapshot.session.user.email ? { email } : {}) }).then(scheduleReload).catch(refused);
    },
    // Creating or switching a studio changes the session token, so the window does it (boot.ts).
    createStudio: () => { throw new Error("createStudio goes through boot.ts in the desktop app"); },
    switchStudio: () => { throw new Error("switchStudio goes through boot.ts in the desktop app"); },
    setStudioName: (name) => {
      snapshot = { ...snapshot, session: { ...snapshot.session, studio: { ...snapshot.session.studio, name, initial: name.charAt(0).toUpperCase() } } };
      emit();
      void call("PUT", "/studio", { name }).then(scheduleReload).catch(refused);
    },
    createProject: async ({ name, blender, unreal }) => {
      const made = await call<{ project: Wire }>("POST", "/projects", { name, folder_name: slugOfName(name), blender_version: blender, ue_version: unreal, package_version: "0.1.0" });
      await load();
      return snapshot.session.studio.projects.find((p) => p.id === String(made.project["id"])) ?? snapshot.session.studio.projects[0]!;
    },
    renameProject: (slug, name) => {
      const target = snapshot.session.studio.projects.find((p) => p.slug === slug);
      snapshot = { ...snapshot, session: { ...snapshot.session, studio: { ...snapshot.session.studio, projects: snapshot.session.studio.projects.map((p) => (p.slug === slug ? { ...p, name, slug: slugOf(name) } : p)) } } };
      emit();
      if (target) void call("PUT", `/projects/${target.id}`, { name }).then(scheduleReload).catch(refused);
    },
    deleteProject: (slug) => {
      const target = snapshot.session.studio.projects.find((p) => p.slug === slug);
      snapshot = { ...snapshot, session: { ...snapshot.session, studio: { ...snapshot.session.studio, projects: snapshot.session.studio.projects.filter((p) => p.slug !== slug) } } };
      emit();
      if (target) void call("DELETE", `/projects/${target.id}`).then(scheduleReload).catch(refused);
    },
    createAsset: async (_projectSlug, name, template, parts, options) => {
      const tpl = snapshot.templates.find((t) => t.name === template);
      if (!tpl) throw new Error(`The project has no template named ${template}.`);
      const blenderPart = tpl.parts.find((p) => p.name === "model") ?? tpl.parts[0];
      const chosen = parts === "one" ? [blenderPart?.name ?? "model"] : undefined;
      // The person creating the asset owns its parts until someone assigns them. The Blender
      // panel lists the parts you own, so a fresh asset shows up there at once.
      const owners = Object.fromEntries((chosen ?? tpl.parts.map((p) => p.name)).map((n) => [n, snapshot.session.user.id]));
      const files = options?.file && blenderPart ? { [blenderPart.name]: options.file } : {};
      await call("POST", "/assets", { project_id: config.projectId, template_name: template, name, owners, files, ...(chosen ? { parts: chosen } : {}) });
      await load();
      return snapshot.assets.find((a) => a.name === name) ?? snapshot.assets[0]!;
    },
    freeBlendFiles: async () => {
      if (!config.folder) return [];
      const taken = new Set(snapshot.assets.flatMap((a) => a.parts.map((p) => p.file)).filter((f): f is string => f !== null));
      return (await agent.listBlendFiles(config.folder)).filter((f) => !taken.has(f));
    },
    setMemberRole: (personId, role) => {
      snapshot = { ...snapshot, people: snapshot.people.map((p) => (p.id === personId ? { ...p, role, title: ROLE_WORDS[role] } : p)) };
      emit();
      void call("PUT", `/studio/members/${personId}`, { roles: [role] }).then(scheduleReload).catch(refused);
    },
    removeMember: (personId) => {
      snapshot = { ...snapshot, people: snapshot.people.filter((p) => p.id !== personId) };
      emit();
      void call("DELETE", `/studio/members/${personId}`).then(scheduleReload).catch(refused);
    },
    connect: async (id: ConnectionId) => {
      if (id === "blender") await agent.toolsInstallBlender();
      else if (id === "unreal") {
        const report = await agent.toolsDetect(config.folder ?? "");
        const first = report.uprojects[0];
        if (!first) throw new Error("Put your Unreal project inside the project folder first.");
        await agent.toolsInstallUe(first);
      }
      connections = connections.map((c) => (c.id === id ? { ...c, connected: true } : c));
      snapshot = { ...snapshot, connections };
      emit();
    },
    ask: (question) => askAbout(question, snapshot.assets),
    invite: (email, role, options) => {
      const proj = options?.projectSlug ? snapshot.session.studio.projects.find((p) => p.slug === options.projectSlug) : undefined;
      const req = proj
        ? call("POST", `/projects/${proj.id}/members`, { email, roles: [role], ...(options?.note ? { note: options.note } : {}) })
        : call("POST", "/studio/members", { email, roles: [role] });
      void req.then(scheduleReload).catch(refused);
    },
    setDiscordWebhook: async (url) => { await call("PUT", `/projects/${config.projectId}/discord`, { webhook_url: url }); },
    setTraining: async (training) => { await call("PUT", "/studio/training", { training }); await load(); },
    exportAsset: async (assetSlug) => {
      const a = snapshot.assets.find((x) => x.slug === assetSlug);
      if (!a) throw new Error(`no asset ${assetSlug}`);
      return JSON.stringify(await call<unknown>("GET", `/export/${a.id}`), null, 2);
    },
    deletedProjects: async () => (await call<{ projects: { id: string; name: string; deleted_at: string | null }[] }>("GET", "/projects/deleted")).projects.map((p) => ({ id: p.id, name: p.name, deletedAt: p.deleted_at ?? "" })),
    restoreProject: async (id) => { await call("POST", `/projects/${id}/restore`); await load(); },
    setDigestIndex: (i) => { digestIndex = Math.max(0, Math.min(snapshot.digests.length - 1, i)); snapshot = { ...snapshot, digestIndex }; emit(); },
    setDigestHome: (on) => { digestHome = on; snapshot = { ...snapshot, session: { ...snapshot.session, digestHome: on } }; emit(); },
    setTheme: (theme) => { snapshot = { ...snapshot, session: { ...snapshot.session, theme } }; emit(); },
  };
}

function emptySnapshot(theme: "dark" | "light"): Snapshot {
  const studio: Studio = { id: "", name: "", initial: "", peopleCount: 0, projects: [], training: "off", billing: { line: "", seats: 0 } };
  const user: Person = { id: "", name: "", initial: "", tone: 1, title: "", role: "viewer", email: "", presence: "offline", where: "", seen: "" };
  return { session: { user, studio, studios: [], theme, digestHome: true }, people: [], assets: [], activity: [], templates: [], digests: [], digestIndex: 0, connections: [], mentions: [], trainingLog: [], online: 0, changedToday: 0, changedThisWeek: 0 };
}

/** "10 Oct 2026" from an ISO instant. */
export function dateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** The Connections cards from what the agent found. The rest are Soon. */
export function connectionsOf(found: { blender: string | null; unreal: string | null; blenderConnected: boolean; unrealConnected: boolean }): Connection[] {
  return [
    { id: "blender", name: "Blender", soon: false, connected: found.blenderConnected, version: found.blender ?? undefined, line: found.blender ? (found.blenderConnected ? `Blender ${found.blender}. The Nkata panel is in the sidebar, press N.` : `Blender ${found.blender} is on this computer. Connect adds the Nkata panel.`) : "Not found. Install Blender 4.2 or newer, then come back." },
    { id: "unreal", name: "Unreal Engine", soon: false, connected: found.unrealConnected, line: found.unreal ? (found.unrealConnected ? "The Nkata tab is in the editor." : "An Unreal project is in the folder. Connect adds the Nkata tab to it.") : "Put your Unreal project inside the project folder, then connect." },
    { id: "discord", name: "Discord", soon: false, connected: false, line: "A message when a part is sent back or approved. A recap every evening." },
    { id: "linear", name: "Linear", soon: true, connected: false, line: "Turn a pinned comment into an issue." },
    { id: "substance", name: "Substance", soon: true, connected: false, line: "Textures and materials." },
    { id: "maya", name: "Maya", soon: true, connected: false, line: "Modeling and rigging." },
    { id: "houdini", name: "Houdini", soon: true, connected: false, line: "Procedural assets." },
    { id: "unity", name: "Unity", soon: true, connected: false, line: "A second engine." },
    { id: "godot", name: "Godot", soon: true, connected: false, line: "A second engine." },
  ];
}
