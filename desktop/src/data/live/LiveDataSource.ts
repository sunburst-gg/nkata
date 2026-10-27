// The live DataSource: the server's REST routes for reads and writes (docs/engineering.md,
// Protocols), GET /events?since= polled every 2 s for everything that changes, and the agent
// on this computer through the Tauri commands for Blender, the add-on and the folder. The
// screens never see a wire shape; wire.ts maps every row onto the v8 nouns.
import type { PresenceEntry } from "@nkata/shared";
import type { DataEvent, DataSource, Unsubscribe } from "../DataSource";
import { DEFAULT_BUDGETS, type Asset, type BlenderInstall, type Budgets, type CheckKey, type Comment, type DeletedProject, type LocalProject, type Member, type Mention, type Person, type Project, type Role, type Studio, type StudioRef } from "../types";
import { agent as tauriAgent, type ToolsReport, inTauri } from "@/lib/tauri";
import { apply as applyConnection, INITIAL as NO_BLENDER, type BlenderState, type ConnectionEvent } from "@/app/connection";
import { isViewer } from "@/auth/permissions";
import { assetOf, budgetsOf, budgetsWire, colorOf, commentOf, memberOf, mentionsOf, namesMe, personOf, projectOf, roleOf, studioRefsOf, SERVER_ROLE, type AccountWire, type AssetWire, type CheckWire, type CommentWire, type EventWire, type MemberWire, type PartWire, type ProjectWire, type ReviewWire, type VersionWire } from "./wire";
import { readSession, writeSession, type SavedSession } from "./session";
import { CHECK_ID, holds } from "../rules";

/** Events per /events page. */
const EVENT_PAGE = 200;

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface LiveConfig {
  serverUrl: string;
  token: string;
  /** The synced folder on this computer, or null in stream mode. */
  folder?: string | null;
  fetch?: Fetch;
  now?: () => Date;
  agent?: typeof tauriAgent;
  /** How often /events is asked. 2 s in the app, 0 in tests (no timer). */
  pollMs?: number;
  /** The add-on version this app ships. */
  addonVersion?: string;
}

/** One asset's rows as the server sent them; the wall is rebuilt from these without a fetch. */
interface Raw { a: AssetWire; part: PartWire; versions: VersionWire[]; reviews: ReviewWire[]; comments: CommentWire[]; checks: CheckWire[] }

interface Loaded {
  projectId: string;
  /** In the server's order. */
  raw: Raw[];
  assets: Asset[];
  partOf: Map<string, PartWire>;
  versionsOf: Map<string, VersionWire[]>;
  commentsOf: Map<string, Comment[]>;
  online: PresenceEntry[];
  budgets: Budgets;
  people: Map<string, Person>;
}

const ADDON_VERSION = "1.4.0";
const HEARTBEAT_LOST_MS = 60_000;

export class LiveDataSource implements DataSource {
  me: Person | null = null;
  private account: AccountWire | null = null;
  private token: string;
  private readonly fetchImpl: Fetch;
  private readonly now: () => Date;
  private readonly agent: typeof tauriAgent;
  private readonly handlers = new Set<(e: DataEvent) => void>();
  private loaded: Loaded | null = null;
  private lastEventId: string | null = null;
  /** The project whose history the cursor has caught up with. Until then nothing is relayed. */
  private caughtUp: string | null = null;
  private online = true;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private beatTimer: ReturnType<typeof setTimeout> | null = null;
  private everSeen = new Set<string>();
  private blenderState: BlenderState = NO_BLENDER;
  private folder: string | null;

  constructor(private readonly config: LiveConfig) {
    this.token = config.token;
    this.fetchImpl = config.fetch ?? ((input, init) => fetch(input, init));
    this.now = config.now ?? (() => new Date());
    this.agent = config.agent ?? tauriAgent;
    this.folder = config.folder ?? null;
  }

  get blender(): BlenderState { return this.blenderState; }
  /** The Unreal projects inside the place on this computer: what Connect Unreal offers. */
  async detectUnreal(): Promise<string[]> {
    if (!this.folder) return [];
    return (await this.agent.toolsDetect(this.folder)).uprojects;
  }
  /** Connect Unreal: the plugin into that project, with Python and Remote Control on. */
  async connectUnreal(uproject: string): Promise<void> {
    await this.agent.toolsInstallUe(uproject);
    writeFlag("nkata.unreal.connected", true);
  }
  /** Whether Unreal was connected on this computer before. */
  unrealConnectedBefore(): boolean { return readFlag("nkata.unreal.connected"); }
  /** Whether the server has the Unreal mirror on (UNREAL_ENABLED): Unreal settings show only then. */
  unrealEnabled(): boolean { return !!this.account?.features?.unreal; }
  /** Whether Blender connected on this computer before: known at launch, before detection. */
  blenderConnectedBefore(): boolean { return readFlag("nkata.blender.connected"); }
  get signedIn(): boolean { return this.token.length > 0; }

  subscribe(handler: (e: DataEvent) => void): Unsubscribe {
    this.handlers.add(handler);
    return () => { this.handlers.delete(handler); };
  }
  private emit(e: DataEvent): void { for (const h of this.handlers) h(e); }

  // ---- transport

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.config.serverUrl}${path}`, { method, headers: { ...(this.token ? { authorization: `Bearer ${this.token}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (err) {
      this.setOnline(false);
      throw new Error(`Offline. ${err instanceof Error ? err.message : String(err)}`);
    }
    this.setOnline(true);
    const json = (await res.json()) as T & { error?: { code: string; message: string } };
    if (!res.ok) throw new Error(json.error?.message ?? `${method} ${path} answered ${res.status}`);
    return json;
  }
  private setOnline(online: boolean): void {
    if (this.online === online) return;
    this.online = online;
    this.emit({ type: "online", online });
  }
  private session(): SavedSession { return { serverUrl: this.config.serverUrl, token: this.token, projectId: this.loaded?.projectId ?? readSession()?.projectId ?? "", folder: this.folder }; }
  private remember(): void { writeSession(this.session()); }

  // ---- the account

  async loadAccount(): Promise<Person | null> {
    if (!this.token) return null;
    this.account = await this.call<AccountWire>("GET", "/auth/me");
    this.me = personOf(this.account.user, this.account.roles, this.account.email);
    return this.me;
  }
  private need(): Person {
    if (!this.me) throw new Error("Sign in first.");
    return this.me;
  }

  async requestCode(email: string): Promise<{ sent: true; code?: string }> {
    const res = await this.call<{ sent: boolean; code?: string }>("POST", "/auth/magic-link", { email });
    return res.code ? { sent: true, code: res.code } : { sent: true };
  }
  async redeemCode(email: string, code: string): Promise<Person> {
    let acc: AccountWire & { token: string };
    try {
      acc = await this.call<AccountWire & { token: string }>("POST", "/auth/code", { email, code });
    } catch (err) {
      const m = err instanceof Error ? err.message : "";
      throw new Error(/used|attempt|tries/i.test(m) ? "used up" : "wrong");
    }
    this.token = acc.token;
    this.remember();
    return (await this.loadAccount())!;
  }
  async signOut(): Promise<void> {
    this.stop();
    // The place and the background process belong to this person. Kept, the next account synced
    // its own project into the last person's folder (docs/decisions.md, 2026-10-27).
    await this.agent.stop();
    this.token = "";
    this.account = null;
    this.me = null;
    this.loaded = null;
    this.lastEventId = null;
    this.caughtUp = null;
    this.folder = null;
    writeSession({ ...this.session(), projectId: "" });
  }
  async setMe(name: string): Promise<Person> {
    await this.call("PUT", "/me", { name: name.trim() });
    return (await this.loadAccount())!;
  }
  async listStudios(): Promise<StudioRef[]> {
    if (!this.account) await this.loadAccount();
    return this.account ? studioRefsOf(this.account) : [];
  }
  async switchStudio(id: string): Promise<void> {
    const acc = await this.call<AccountWire & { token: string }>("POST", "/auth/switch", { studio_id: id });
    this.token = acc.token;
    this.loaded = null;
    this.lastEventId = null;
    this.caughtUp = null;
    this.remember();
    await this.loadAccount();
  }
  async createStudio(name: string): Promise<Studio> {
    const acc = await this.call<AccountWire & { token: string }>("POST", "/studios", { name: name.trim() });
    this.token = acc.token;
    this.remember();
    await this.loadAccount();
    return (await this.getStudio())!;
  }
  async getStudio(): Promise<Studio | null> {
    if (!this.account) await this.loadAccount();
    if (!this.account?.studio_id) return null;
    const res = await this.call<{ studio: { id: string; name: string; training: "on" | "off" } }>("GET", "/studio");
    return { id: res.studio.id, name: res.studio.name, training: res.studio.training === "on" };
  }
  async setStudioName(name: string): Promise<void> { await this.call("PUT", "/studio", { name: name.trim() }); }
  async setTraining(on: boolean): Promise<void> { await this.call("PUT", "/studio/training", { training: on ? "on" : "off" }); }

  // ---- projects

  async listProjects(): Promise<Project[]> {
    if (!this.account?.studio_id) return [];
    const res = await this.call<{ projects: (ProjectWire & { color?: string | null })[] }>("GET", "/projects");
    return res.projects.map((p) => ({ ...projectOf(p), color: p.color ?? colorOf(p.id) }));
  }
  async getProject(id: string): Promise<Project | null> { return (await this.listProjects()).find((p) => p.id === id) ?? null; }
  async createProject(name: string, color: string): Promise<Project> {
    const folder = name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "") || "project";
    const res = await this.call<{ project: ProjectWire & { color?: string | null } }>("POST", "/projects", { name: name.trim(), folder_name: folder, blender_version: "4.2", ue_version: "5.4", package_version: "0.1.0", color });
    return { ...projectOf(res.project), color: res.project.color ?? color };
  }
  async renameProject(id: string, name: string): Promise<void> { await this.call("PUT", `/projects/${id}`, { name: name.trim() }); }
  async setProjectColor(id: string, color: string): Promise<void> { await this.call("PUT", `/projects/${id}`, { color }); }
  async deleteProject(id: string): Promise<void> { await this.call("DELETE", `/projects/${id}`); }
  async listDeletedProjects(): Promise<DeletedProject[]> {
    const res = await this.call<{ projects: { id: string; name: string; deleted_at: string | null }[] }>("GET", "/projects/deleted");
    return res.projects.map((p) => ({ id: p.id, name: p.name, deletedAt: p.deleted_at ? p.deleted_at.slice(0, 10) : "" }));
  }
  async restoreProject(id: string): Promise<void> { await this.call("POST", `/projects/${id}/restore`); }
  async getBudgets(projectId: string): Promise<Budgets> {
    const res = await this.call<{ budgets: Parameters<typeof budgetsOf>[0] }>("GET", `/projects/${projectId}/budgets`);
    return budgetsOf(res.budgets);
  }
  async setBudgets(projectId: string, budgets: Budgets): Promise<number> {
    await this.call("PUT", `/projects/${projectId}/budgets`, budgetsWire(budgets));
    const assets = await this.load(projectId, true);
    return assets.filter((a) => a.versions[0]?.checks.some((c) => c.key === "tris" && !c.pass && !c.pending)).length;
  }
  async setAssetBudget(assetId: string, n: number | null): Promise<void> {
    await this.call("PUT", `/assets/${assetId}`, { budget: n });
    await this.reloadAssets([assetId]);
  }

  // ---- the wall: one load per project, refreshed on events

  private async load(projectId: string, force = false): Promise<Asset[]> {
    if (this.loaded && this.loaded.projectId === projectId && !force) return this.loaded.assets;
    const me = this.need();
    const [assetsRes, membersRes, onlineRes, budgetsRes] = await Promise.all([
      this.call<{ assets: AssetWire[] }>("GET", `/assets?project_id=${projectId}`),
      this.call<{ members: MemberWire[] }>("GET", "/studio/members"),
      this.call<{ online: PresenceEntry[] }>("GET", `/presence?project_id=${projectId}`),
      this.call<{ budgets: Parameters<typeof budgetsOf>[0] }>("GET", `/projects/${projectId}/budgets`).catch(() => ({ budgets: undefined })),
    ]);
    const people = new Map(membersRes.members.map((m) => [m.user.id, personOf(m.user, m.roles, m.email)]));
    people.set(me.id, me);
    for (const o of onlineRes.online) this.everSeen.add(o.user.id);
    const raw = (await Promise.all(assetsRes.assets.map((a) => this.fetchRaw(a)))).filter((r): r is Raw => r !== null);
    this.loaded = { projectId, raw, assets: [], partOf: new Map(), versionsOf: new Map(), commentsOf: new Map(), online: onlineRes.online, budgets: budgetsOf(budgetsRes.budgets), people };
    this.build();
    this.remember();
    return this.loaded.assets;
  }

  /** One asset's part, versions, reviews, comments and the newest version's checks. */
  private async fetchRaw(a: AssetWire): Promise<Raw | null> {
    const detail = await this.call<{ parts: PartWire[] }>("GET", `/assets/${a.id}`);
    // The part Blender saves into. A v8 asset has one part; a template asset (the seed, older
    // projects) lists concept first, which never holds a save (docs/decisions.md, 2026-10-27).
    const part = detail.parts.find((p) => p.mapping.kind === "blend_collection") ?? detail.parts[0];
    if (!part) return null;
    const [versionsRes, reviewsRes, commentsRes] = await Promise.all([
      this.call<{ versions: VersionWire[] }>("GET", `/parts/${part.id}/versions`),
      this.call<{ reviews: ReviewWire[] }>("GET", `/reviews?part_id=${part.id}`),
      this.call<{ comments: CommentWire[] }>("GET", `/parts/${part.id}/comments`),
    ]);
    const versions = versionsRes.versions.slice().sort((x, y) => y.created_at.localeCompare(x.created_at));
    const latest = versions[0];
    const checks = latest ? (await this.call<{ results: CheckWire[] }>("GET", `/parts/${part.id}/versions/${latest.id}/checks`).catch(() => ({ results: [] }))).results : [];
    return { a, part, versions, reviews: reviewsRes.reviews, comments: commentsRes.comments, checks };
  }

  /** The wall from the rows in hand: no fetch. Presence and the clock move Live; nothing else does. */
  private build(): void {
    const l = this.loaded;
    if (!l) return;
    const me = this.need();
    const now = this.now();
    l.partOf = new Map(); l.versionsOf = new Map(); l.commentsOf = new Map();
    l.assets = l.raw.map(({ a, part, versions, reviews, comments: wire, checks }) => {
      l.partOf.set(a.id, part);
      l.versionsOf.set(a.id, versions);
      const latest = versions[0];
      const numbered = numberVersions(versions);
      const comments = wire.map((c) => commentOf(c, a.id, numbered.get(c.version_id) ?? 1, l.people, now));
      l.commentsOf.set(a.id, comments);
      const mentionsMe = comments.some((c) => c.author.id !== me.id && namesMe(c.text, me));
      return assetOf({
        a, part, people: l.people, online: l.online, budgets: l.budgets, now, mentionsMe, comments,
        versions: versions.map((v) => ({ v, checks: v.id === latest?.id ? checks : [], reviews, partApproved: part.state === "approved", exceptions: part.exceptions ?? [] })),
      });
    });
  }

  /**
   * Fetch again only the assets an event or an action touched (v8 step 16, item 7). One list
   * call keeps names, groups and budgets current and finds assets made since; the rest is per
   * asset. A full reload made four or five calls per asset on every event.
   */
  private async reloadAssets(assetIds: readonly string[]): Promise<void> {
    const l = this.loaded;
    if (!l) return;
    const list = (await this.call<{ assets: AssetWire[] }>("GET", `/assets?project_id=${l.projectId}`)).assets;
    const known = new Map(l.raw.map((r) => [r.a.id, r]));
    const wanted = new Set(assetIds);
    const next = await Promise.all(list.map(async (a) => {
      const had = known.get(a.id);
      if (had && !wanted.has(a.id)) return { ...had, a };
      return this.fetchRaw(a);
    }));
    l.raw = next.filter((r): r is Raw => r !== null);
    this.build();
  }

  async listAssets(projectId: string): Promise<Asset[]> { return this.load(projectId); }
  async getAsset(id: string): Promise<Asset | null> {
    if (!this.loaded) return null;
    return this.loaded.assets.find((a) => a.id === id) ?? null;
  }
  async listComments(assetId: string): Promise<Comment[]> { return this.loaded?.commentsOf.get(assetId) ?? []; }
  async listMentions(projectId: string): Promise<Mention[]> {
    const assets = await this.load(projectId);
    const comments = [...(this.loaded?.commentsOf.values() ?? [])].flat();
    return mentionsOf(assets, comments, this.need());
  }
  async listMembers(projectId: string): Promise<Member[]> {
    await this.load(projectId);
    return this.listStudioMembers();
  }
  async listStudioMembers(): Promise<Member[]> {
    const res = await this.call<{ members: MemberWire[] }>("GET", "/studio/members");
    const online = this.loaded?.online ?? [];
    return res.members.map((m) => memberOf(m, online, this.everSeen, this.now()));
  }
  async invite(projectId: string, email: string, role: Role): Promise<Member> {
    const res = await this.call<{ member: MemberWire }>("POST", `/projects/${projectId}/members`, { email: email.trim(), roles: [SERVER_ROLE[role]] });
    const member = memberOf(res.member, this.loaded?.online ?? [], this.everSeen, this.now());
    this.emit({ type: "memberChanged", personId: member.person.id, journey: member.journey });
    return member;
  }
  async setMemberRole(personId: string, role: Role): Promise<void> {
    const members = await this.call<{ members: MemberWire[] }>("GET", "/studio/members");
    const producers = members.members.filter((m) => m.roles.includes("producer"));
    if (role !== "producer" && producers.length === 1 && producers[0]!.user.id === personId) throw new Error("A studio keeps at least one producer.");
    await this.call("PUT", `/studio/members/${personId}`, { roles: [SERVER_ROLE[role]] });
    if (personId === this.me?.id) await this.loadAccount();
    this.emit({ type: "memberChanged", personId, journey: "joined" });
  }
  async removeMember(personId: string): Promise<void> {
    const members = await this.call<{ members: MemberWire[] }>("GET", "/studio/members");
    const producers = members.members.filter((m) => m.roles.includes("producer"));
    if (producers.length === 1 && producers[0]!.user.id === personId) throw new Error("A studio keeps at least one producer.");
    await this.call("DELETE", `/studio/members/${personId}`);
    this.emit({ type: "memberChanged", personId, journey: "invited" });
  }

  // ---- the three decisions and the comments

  private partFor(assetId: string): PartWire {
    const part = this.loaded?.partOf.get(assetId);
    if (!part) throw new Error("That asset is not loaded.");
    return part;
  }
  private versionId(assetId: string, n: number | "latest"): string {
    const versions = this.loaded?.versionsOf.get(assetId) ?? [];
    if (n === "latest") {
      const latest = versions[0];
      if (!latest) throw new Error("Save once in Blender first.");
      return latest.id;
    }
    const numbered = numberVersions(versions);
    const hit = versions.find((v) => numbered.get(v.id) === n) ?? versions[0];
    if (!hit) throw new Error("Save once in Blender first.");
    return hit.id;
  }
  async publish(assetId: string, note: string, noteEngineering?: string, overrideReason?: string): Promise<void> {
    if (!note.trim()) throw new Error("Write one line first.");
    const asset = await this.getAsset(assetId);
    if (!overrideReason && asset?.versions[0]?.checks.some(holds)) throw new Error("Fix the red check first.");
    const part = this.partFor(assetId);
    const vid = this.versionId(assetId, "latest");
    // The server holds Publish on a failing block level check too (v8 step 21), so its answer counts.
    const res = await this.call<{ published: boolean }>("POST", `/parts/${part.id}/publish`, { version_id: vid, note: note.trim(), note_engineering: noteEngineering?.trim() ?? "", ready: true, ...(overrideReason ? { override_reason: overrideReason.trim() } : {}) });
    if (!res.published) { await this.reloadAssets([assetId]); throw new Error("Fix the red check first."); }
    await this.reloadAssets([assetId]);
    this.emit({ type: "published", assetId, version: (await this.getAsset(assetId))?.versions[0]?.n ?? 1 });
  }
  async approve(assetId: string, version: number): Promise<void> {
    const part = this.partFor(assetId);
    const vid = this.versionId(assetId, version);
    await this.call("POST", "/reviews", { part_id: part.id, version_id: vid, score: 5, decision: "approve", note: "" });
    await this.reloadAssets([assetId]);
    this.emit({ type: "approved", assetId, version });
  }
  async requestChanges(assetId: string, version: number): Promise<void> {
    const part = this.partFor(assetId);
    const vid = this.versionId(assetId, version);
    const mine = (this.loaded?.commentsOf.get(assetId) ?? []).filter((c) => c.author.id === this.me?.id && c.version === version);
    if (mine.length === 0) throw new Error("Pin the spot or write one line first.");
    await this.call("POST", "/reviews", { part_id: part.id, version_id: vid, score: 3, decision: "send_back", note: mine[mine.length - 1]?.text ?? "" });
    await this.reloadAssets([assetId]);
    this.emit({ type: "changesRequested", assetId, version });
  }
  async comment(assetId: string, text: string, pin?: [number, number, number]): Promise<Comment> {
    const part = this.partFor(assetId);
    const vid = this.versionId(assetId, "latest");
    const res = await this.call<{ comment: CommentWire }>("POST", "/comments", { part_id: part.id, version_id: vid, point: pin ?? [0, 0, 0], normal: [0, 0, 1], body: text.trim() });
    await this.reloadAssets([assetId]);
    const made = (this.loaded?.commentsOf.get(assetId) ?? []).find((c) => c.id === res.comment.id) ?? commentOf(res.comment, assetId, 1, this.loaded?.people ?? new Map(), this.now());
    this.emit({ type: "commented", assetId, commentId: made.id });
    return made;
  }
  async resolveComment(assetId: string, commentId: string, done: boolean): Promise<void> {
    await this.call("POST", `/comments/${commentId}/${done ? "resolve" : "reopen"}`, {});
    await this.reloadAssets([assetId]);
    this.emit({ type: "commented", assetId, commentId });
  }
  async fixCheck(): Promise<void> { throw new Error("Fix runs in Blender. Open the model there and press Fix."); }
  async acceptCheck(assetId: string, key: CheckKey, reason: string): Promise<void> {
    if (!reason.trim()) throw new Error("Write one line on why first.");
    const part = this.partFor(assetId);
    await this.call("POST", `/parts/${part.id}/exceptions`, { check_id: CHECK_ID[key], reason: reason.trim() });
    await this.reloadAssets([assetId]);
  }
  async takeBackCheck(assetId: string, key: CheckKey): Promise<void> {
    const part = this.partFor(assetId);
    await this.call("DELETE", `/parts/${part.id}/exceptions/${CHECK_ID[key]}`);
    await this.reloadAssets([assetId]);
  }
  async openInBlender(assetId: string, version?: number): Promise<void> {
    const part = this.partFor(assetId);
    if (version !== undefined) {
      const vid = this.versionId(assetId, version);
      await this.agent.openVersion(part.id, vid, `${part.name}_v${version}.blend`);
      return;
    }
    const file = part.mapping.file;
    if (!file) throw new Error("This model has no Blender file yet.");
    await this.agent.openInBlender(file);
  }
  async download(assetId: string, format: "glb" | "fbx" | "image", version?: number): Promise<string> {
    const versions = this.loaded?.versionsOf.get(assetId) ?? [];
    const numbered = numberVersions(versions);
    const v = version === undefined ? versions[0] : versions.find((x) => numbered.get(x.id) === version) ?? versions[0];
    if (!v) throw new Error("Nothing to download yet.");
    const url = format === "image" ? v.render_url : v.model_url;
    if (!url) throw new Error(format === "image" ? "No still for this Version yet." : "No model for this Version yet.");
    const asset = await this.getAsset(assetId);
    const name = `${(asset?.name ?? "asset").replace(/[^A-Za-z0-9]+/g, "_")}_v${numbered.get(v.id) ?? 1}.${format === "image" ? "png" : "glb"}`;
    // In the desktop window a new browser window opens nothing, so the file is saved where the
    // person chooses, through the native Save dialog (https://v2.tauri.app/plugin/dialog/).
    // Cancel returns "". In a plain browser, the browser downloads it.
    if (inTauri()) {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const path = await save({ defaultPath: name });
      if (!path) return "";
      await this.agent.downloadFile(url, path);
      return path.split(/[\\/]/).pop() ?? name;
    }
    if (typeof window !== "undefined" && typeof window.open === "function") window.open(url, "_blank", "noopener");
    return name;
  }

  // ---- events: GET /events?since= every 2 s; a lost server shows as the offline line

  start(projectId: string): void {
    this.stop();
    const tick = async () => {
      try { await this.poll(projectId); } catch { /* the call marked us offline; the next tick retries */ }
      if (this.config.pollMs !== 0) this.timer = setTimeout(() => void tick(), this.config.pollMs ?? 2000);
    };
    void tick();
  }
  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  /** One round of /events. Exposed for tests. */
  async poll(projectId: string): Promise<void> {
    const page = async () => {
      const since = this.lastEventId ? `&since=${this.lastEventId}` : "";
      const res = await this.call<{ events: EventWire[]; next: string | null }>("GET", `/events?project_id=${projectId}${since}&limit=${EVENT_PAGE}`);
      if (res.events.length > 0) this.lastEventId = res.next ?? res.events[res.events.length - 1]!.id;
      return res.events;
    };
    // The first round for a project only moves the cursor to now. The wall load already holds
    // what those events did; relayed, they toasted an approval from an hour ago as news.
    if (this.caughtUp !== projectId) {
      while ((await page()).length === EVENT_PAGE);
      this.caughtUp = projectId;
      return;
    }
    const events = await page();
    if (events.length === 0) return;
    await this.refreshFor(projectId, events.map((x) => x.event));
    for (const { event } of events) this.relay(event);
  }
  /**
   * What a batch of events needs: presence only rebuilds from the rows in hand; an event on a
   * known asset fetches that asset; an asset this computer has not seen, or a kind it does not
   * know, fetches the project once.
   */
  private async refreshFor(projectId: string, events: readonly EventWire["event"][]): Promise<void> {
    const l = this.loaded;
    if (!l || l.projectId !== projectId) { await this.load(projectId, true); return; }
    const assetOfPart = (partId: unknown): string | null => l.raw.find((r) => r.part.id === partId)?.a.id ?? null;
    const touched = new Set<string>();
    let full = false;
    for (const e of events) {
      switch (e.kind) {
        case "presence.changed":
          l.online = (e["online"] as PresenceEntry[] | undefined) ?? l.online;
          break;
        case "studio.training":
          break;
        case "comment.created":
        case "comment.resolved": {
          const id = assetOfPart((e["comment"] as CommentWire | undefined)?.part_id);
          if (id) touched.add(id); else full = true;
          break;
        }
        case "version.created": case "review.decided": case "part.state": case "lock.granted": case "lock.released": case "lock.requested": case "mirror.result": case "gate.opened": {
          const id = assetOfPart(e["part_id"]);
          if (id) touched.add(id); else full = true;
          break;
        }
        default:
          full = true;
      }
    }
    if (full) { await this.load(projectId, true); return; }
    if (touched.size) await this.reloadAssets([...touched]);
    else this.build();
  }

  private relay(e: EventWire["event"]): void {
    const assetFor = (partId: unknown): string | null => {
      for (const [assetId, part] of this.loaded?.partOf ?? []) if (part.id === partId) return assetId;
      return null;
    };
    switch (e.kind) {
      case "version.created": {
        const assetId = assetFor(e["part_id"]);
        if (!assetId) return;
        if (e["published"]) this.emit({ type: "published", assetId, version: this.loaded?.assets.find((a) => a.id === assetId)?.versions[0]?.n ?? 1 });
        else this.emit({ type: "saved", assetId, by: e.actor_id });
        return;
      }
      case "review.decided": {
        const assetId = assetFor(e["part_id"]);
        if (!assetId) return;
        // The decided Version by its id, numbered as the Versions row numbers it.
        const numbered = numberVersions(this.loaded?.versionsOf.get(assetId) ?? []);
        const version = numbered.get(String(e["version_id"])) ?? this.loaded?.assets.find((a) => a.id === assetId)?.versions[0]?.n ?? 1;
        this.emit(e["decision"] === "approve" ? { type: "approved", assetId, version, by: e.actor_id } : { type: "changesRequested", assetId, version, by: e.actor_id });
        return;
      }
      case "comment.created":
      case "comment.resolved": {
        const c = e["comment"] as CommentWire | undefined;
        const assetId = c ? assetFor(c.part_id) : null;
        if (!assetId || !c) return;
        this.emit({ type: "commented", assetId, commentId: c.id, by: e.actor_id, ...(e.kind === "comment.resolved" ? { settled: true } : {}) });
        return;
      }
      case "presence.changed": {
        const online = (e["online"] as PresenceEntry[] | undefined) ?? [];
        if (this.loaded) this.loaded.online = online;
        for (const o of online) {
          this.everSeen.add(o.user.id);
          const part = o.part_id ? [...(this.loaded?.partOf.values() ?? [])].find((p) => p.id === o.part_id) : null;
          this.emit({ type: "presence", personId: o.user.id, file: part?.mapping.file ?? null });
          if (o.user.id === this.me?.id && part?.mapping.file) this.beat(part.mapping.file);
        }
        return;
      }
      default:
        return;
    }
  }

  // ---- this computer: Blender, the add-on, the folder (through the agent)

  private connection(e: ConnectionEvent): void {
    this.blenderState = applyConnection(this.blenderState, e);
    this.emit(e);
  }
  /** On start: what the agent finds, and whether this computer connected before. */
  async detectBlender(): Promise<void> {
    const report: ToolsReport = await this.agent.toolsDetect(this.folder ?? "");
    const installs: BlenderInstall[] = report.blender ? [{ path: report.blender.exe, version: report.blender.version }] : [];
    this.connection({ type: "toolDetected", installs });
    if (installs.length === 1 && this.blenderState.kind === "found" && readFlag("nkata.blender.connected")) this.connection({ type: "addonInstalled", addon: this.config.addonVersion ?? ADDON_VERSION });
  }
  async connectBlender(): Promise<void> {
    if (this.blenderState.kind === "disconnected" || this.blenderState.kind === "notFound") await this.detectBlender();
    if (this.blenderState.kind !== "found") return;
    await this.agent.toolsInstallBlender();
    writeFlag("nkata.blender.connected", true);
    // Blender loads an add-on at start: one installed while it runs needs a restart to show.
    const restart = await this.agent.blenderRunning();
    this.connection(restart ? { type: "addonInstalled", addon: this.config.addonVersion ?? ADDON_VERSION, restart: true } : { type: "addonInstalled", addon: this.config.addonVersion ?? ADDON_VERSION });
  }
  async updateAddon(): Promise<void> {
    if (this.blenderState.kind !== "outdated") return;
    const open = this.blenderState.blenderOpen;
    await this.agent.toolsInstallBlender();
    this.connection(open ? { type: "addonInstalled", addon: this.config.addonVersion ?? ADDON_VERSION, restart: true } : { type: "addonInstalled", addon: this.config.addonVersion ?? ADDON_VERSION });
  }
  async pickBlender(install?: BlenderInstall): Promise<void> {
    if (install) { this.connection({ type: "toolDetected", installs: [install] }); return; }
    await this.detectBlender();
  }
  async reconnectBlender(): Promise<void> {
    if (this.blenderState.kind !== "lost") return;
    await this.agent.toolsInstallBlender();
    this.connection({ type: "heartbeat", file: this.blenderState.file });
  }
  async openBlender(): Promise<void> {
    const first = this.loaded?.assets.map((a) => this.loaded?.partOf.get(a.id)?.mapping.file).find((f): f is string => !!f);
    if (!first) throw new Error("Save a .blend into the project first.");
    await this.agent.openInBlender(first);
  }
  async pause(): Promise<void> {
    await this.agent.stop();
    this.connection({ type: "paused" });
  }
  async resume(): Promise<void> {
    await this.startAgent();
    this.connection({ type: "resumed" });
  }
  async disconnect(): Promise<void> {
    // The dialog says the add-on is removed: Blender removes it, then this computer forgets it.
    await this.agent.toolsRemoveBlender();
    writeFlag("nkata.blender.connected", false);
    this.connection({ type: "disconnected" });
  }
  private beat(file: string): void {
    this.connection({ type: "heartbeat", file });
    if (this.beatTimer) clearTimeout(this.beatTimer);
    if (this.config.pollMs !== 0) this.beatTimer = setTimeout(() => this.connection({ type: "heartbeatLost" }), HEARTBEAT_LOST_MS);
  }
  projectFolder(projectId: string): string | null {
    const saved = readSession();
    return this.folder && (!saved?.projectId || saved.projectId === projectId || this.loaded?.projectId === projectId) ? this.folder : null;
  }
  /** The project on this computer: remember the place, keep it in step there, tick the setup row. */
  async placeProject(projectId: string, folder: string): Promise<void> {
    const picked = folder.trim();
    if (!picked) throw new Error("Choose where the project lives on this computer.");
    // A folder that holds other work gets the project in a folder of its own inside it.
    const name = (await this.getProject(projectId))?.name ?? "Nkata project";
    const at = await this.agent.placeFor(picked, name, projectId);
    this.folder = at;
    this.remember();
    await this.agent.startSync(this.config.serverUrl, this.token, projectId, at);
    this.emit({ type: "agent", running: true });
    this.emit({ type: "setup", step: "project", meta: at });
    this.emit({ type: "localChanged" });
  }
  /** At launch: the background process runs again for whoever signed in, in step with the place they chose, or watching for a viewer. */
  async ensureAgent(): Promise<void> {
    const status = await this.agent.status().catch(() => null);
    if (status?.running) return;
    if (this.folder || (this.me && isViewer(this.me.role))) await this.startAgent();
  }
  private async startAgent(): Promise<void> {
    const projectId = this.loaded?.projectId ?? readSession()?.projectId ?? "";
    if (!projectId) return;
    if (this.folder) await this.agent.startSync(this.config.serverUrl, this.token, projectId, this.folder);
    else await this.agent.startStream(this.config.serverUrl, this.token, projectId);
    this.emit({ type: "agent", running: true });
  }
  async restartAgent(): Promise<void> { await this.startAgent(); }
  async listLocalProjects(): Promise<LocalProject[]> {
    if (!this.folder || !this.loaded) return [];
    const status = await this.agent.status();
    const project = (await this.listProjects()).find((p) => p.id === this.loaded?.projectId);
    if (!project) return [];
    const bytes = await this.agent.folderBytes(this.folder);
    return [{ projectId: project.id, name: project.name, path: this.folder, bytes, syncing: status.running && status.mode === "sync", ...(status.problem ? { problem: status.problem } : {}) }];
  }
  async showInFinder(): Promise<void> { /* the desktop build opens the folder; the window has no command for it yet */ }
  async moveProject(): Promise<string> { throw new Error("Move comes with the next desktop build. The files stay where they are."); }
  async stopSyncing(): Promise<void> { await this.agent.stop(); this.emit({ type: "localChanged" }); }
  async syncAgain(): Promise<void> { await this.startAgent(); this.emit({ type: "localChanged" }); }

  /** Which project the saved session had, if any. */
  savedProjectId(): string { return readSession()?.projectId ?? ""; }
  setFolder(folder: string | null): void { this.folder = folder; this.remember(); }
}

/** Published Versions count from v1 in time order; an unpublished newest save takes the next number. */
function numberVersions(versions: readonly VersionWire[]): Map<string, number> {
  const sorted = [...versions].sort((x, y) => x.created_at.localeCompare(y.created_at));
  const out = new Map<string, number>();
  let n = 0;
  for (const v of sorted) if (v.published) out.set(v.id, ++n);
  const latest = sorted[sorted.length - 1];
  if (latest && !latest.published) out.set(latest.id, n + 1);
  return out;
}

function readFlag(key: string): boolean {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}
function writeFlag(key: string, on: boolean): void {
  try { if (on) localStorage.setItem(key, "1"); else localStorage.removeItem(key); } catch { /* private mode */ }
}

export { DEFAULT_BUDGETS, roleOf };
