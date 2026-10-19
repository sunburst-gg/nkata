// The live DataSource: the server's REST routes for reads and writes (docs/engineering.md,
// Protocols), GET /events?since= polled every 2 s for everything that changes, and the agent
// on this computer through the Tauri commands for Blender, the add-on and the folder. The
// screens never see a wire shape; wire.ts maps every row onto the v8 nouns.
import type { PresenceEntry } from "@nkata/shared";
import type { DataEvent, DataSource, Unsubscribe } from "../DataSource";
import { DEFAULT_BUDGETS, type Asset, type BlenderInstall, type Budgets, type Comment, type DeletedProject, type LocalProject, type Member, type Mention, type Person, type Project, type Role, type Studio, type StudioRef } from "../types";
import { agent as tauriAgent, type ToolsReport } from "@/lib/tauri";
import { apply as applyConnection, INITIAL as NO_BLENDER, type BlenderState, type ConnectionEvent } from "@/app/connection";
import { assetOf, budgetsOf, budgetsWire, colorOf, commentOf, memberOf, mentionsOf, namesMe, personOf, projectOf, roleOf, studioRefsOf, SERVER_ROLE, type AccountWire, type AssetWire, type CheckWire, type CommentWire, type EventWire, type MemberWire, type PartWire, type ProjectWire, type ReviewWire, type VersionWire } from "./wire";
import { readSession, writeSession, type SavedSession } from "./session";

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

interface Loaded {
  projectId: string;
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
    this.token = "";
    this.account = null;
    this.me = null;
    this.loaded = null;
    this.remember();
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
    if (this.loaded) await this.load(this.loaded.projectId, true);
  }

  // ---- the wall: one load per project, refreshed on events

  private async load(projectId: string, force = false): Promise<Asset[]> {
    if (this.loaded && this.loaded.projectId === projectId && !force) return this.loaded.assets;
    const me = this.need();
    const now = this.now();
    const [assetsRes, membersRes, onlineRes, budgetsRes] = await Promise.all([
      this.call<{ assets: AssetWire[] }>("GET", `/assets?project_id=${projectId}`),
      this.call<{ members: MemberWire[] }>("GET", "/studio/members"),
      this.call<{ online: PresenceEntry[] }>("GET", `/presence?project_id=${projectId}`),
      this.call<{ budgets: Parameters<typeof budgetsOf>[0] }>("GET", `/projects/${projectId}/budgets`).catch(() => ({ budgets: undefined })),
    ]);
    const people = new Map(membersRes.members.map((m) => [m.user.id, personOf(m.user, m.roles, m.email)]));
    people.set(me.id, me);
    for (const o of onlineRes.online) this.everSeen.add(o.user.id);
    const budgets = budgetsOf(budgetsRes.budgets);
    const partOf = new Map<string, PartWire>();
    const versionsOf = new Map<string, VersionWire[]>();
    const commentsOf = new Map<string, Comment[]>();
    const assets: Asset[] = [];
    for (const a of assetsRes.assets) {
      const detail = await this.call<{ parts: PartWire[] }>("GET", `/assets/${a.id}`);
      const part = detail.parts[0];
      if (!part) continue;
      partOf.set(a.id, part);
      const [versionsRes, reviewsRes, commentsRes] = await Promise.all([
        this.call<{ versions: VersionWire[] }>("GET", `/parts/${part.id}/versions`),
        this.call<{ reviews: ReviewWire[] }>("GET", `/reviews?part_id=${part.id}`),
        this.call<{ comments: CommentWire[] }>("GET", `/parts/${part.id}/comments`),
      ]);
      const versions = versionsRes.versions.slice().sort((x, y) => y.created_at.localeCompare(x.created_at));
      versionsOf.set(a.id, versions);
      const latest = versions[0];
      const checks = latest ? (await this.call<{ results: CheckWire[] }>("GET", `/parts/${part.id}/versions/${latest.id}/checks`).catch(() => ({ results: [] }))).results : [];
      const numbered = numberVersions(versions);
      const comments = commentsRes.comments.map((c) => commentOf(c, a.id, numbered.get(c.version_id) ?? 1, people, now));
      commentsOf.set(a.id, comments);
      const mentionsMe = comments.some((c) => c.author.id !== me.id && namesMe(c.text, me));
      assets.push(assetOf({
        a, part, people, online: onlineRes.online, budgets, now, mentionsMe,
        versions: versions.map((v) => ({ v, checks: v.id === latest?.id ? checks : [], reviews: reviewsRes.reviews, partApproved: part.state === "approved" })),
      }));
    }
    this.loaded = { projectId, assets, partOf, versionsOf, commentsOf, online: onlineRes.online, budgets, people };
    this.remember();
    return assets;
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
  async publish(assetId: string, note: string, noteEngineering?: string): Promise<void> {
    if (!note.trim()) throw new Error("Write one line first.");
    const asset = await this.getAsset(assetId);
    if (asset?.versions[0]?.checks.some((c) => !c.pass && !c.pending)) throw new Error("Fix the red check first.");
    const part = this.partFor(assetId);
    const vid = this.versionId(assetId, "latest");
    await this.call("POST", `/parts/${part.id}/publish`, { version_id: vid, note: note.trim(), note_engineering: noteEngineering?.trim() ?? "", ready: true });
    await this.load(this.loaded!.projectId, true);
    this.emit({ type: "published", assetId, version: (await this.getAsset(assetId))?.versions[0]?.n ?? 1 });
  }
  async approve(assetId: string, version: number): Promise<void> {
    const part = this.partFor(assetId);
    const vid = this.versionId(assetId, version);
    await this.call("POST", "/reviews", { part_id: part.id, version_id: vid, score: 5, decision: "approve", note: "" });
    await this.load(this.loaded!.projectId, true);
    this.emit({ type: "approved", assetId, version });
  }
  async requestChanges(assetId: string, version: number): Promise<void> {
    const part = this.partFor(assetId);
    const vid = this.versionId(assetId, version);
    const mine = (this.loaded?.commentsOf.get(assetId) ?? []).filter((c) => c.author.id === this.me?.id && c.version === version);
    if (mine.length === 0) throw new Error("Pin the spot or write one line first.");
    await this.call("POST", "/reviews", { part_id: part.id, version_id: vid, score: 3, decision: "send_back", note: mine[mine.length - 1]?.text ?? "" });
    await this.load(this.loaded!.projectId, true);
    this.emit({ type: "changesRequested", assetId, version });
  }
  async comment(assetId: string, text: string, pin?: [number, number, number]): Promise<Comment> {
    const part = this.partFor(assetId);
    const vid = this.versionId(assetId, "latest");
    const res = await this.call<{ comment: CommentWire }>("POST", "/comments", { part_id: part.id, version_id: vid, point: pin ?? [0, 0, 0], normal: [0, 0, 1], body: text.trim() });
    await this.load(this.loaded!.projectId, true);
    const made = (this.loaded?.commentsOf.get(assetId) ?? []).find((c) => c.id === res.comment.id) ?? commentOf(res.comment, assetId, 1, this.loaded?.people ?? new Map(), this.now());
    this.emit({ type: "commented", assetId, commentId: made.id });
    return made;
  }
  async resolveComment(assetId: string, commentId: string, done: boolean): Promise<void> {
    await this.call("POST", `/comments/${commentId}/${done ? "resolve" : "reopen"}`, {});
    await this.load(this.loaded!.projectId, true);
    this.emit({ type: "commented", assetId, commentId });
  }
  async fixCheck(): Promise<void> { throw new Error("Fix runs in Blender. Open the model there and press Fix."); }
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
    const since = this.lastEventId ? `&since=${this.lastEventId}` : "";
    const res = await this.call<{ events: EventWire[]; next: string | null }>("GET", `/events?project_id=${projectId}${since}&limit=200`);
    if (res.events.length === 0) return;
    this.lastEventId = res.next ?? res.events[res.events.length - 1]!.id;
    await this.load(projectId, true);
    for (const { event } of res.events) this.relay(event);
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
        const version = this.loaded?.assets.find((a) => a.id === assetId)?.versions.find((v) => v.approved || v.changesRequested)?.n ?? 1;
        this.emit(e["decision"] === "approve" ? { type: "approved", assetId, version } : { type: "changesRequested", assetId, version });
        return;
      }
      case "comment.created":
      case "comment.resolved": {
        const c = e["comment"] as CommentWire | undefined;
        const assetId = c ? assetFor(c.part_id) : null;
        if (!assetId || !c) return;
        this.emit({ type: "commented", assetId, commentId: c.id });
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
    this.connection({ type: "addonInstalled", addon: this.config.addonVersion ?? ADDON_VERSION });
    this.emit({ type: "setup", step: "project", meta: this.folder ?? "" });
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
    writeFlag("nkata.blender.connected", false);
    this.connection({ type: "disconnected" });
  }
  private beat(file: string): void {
    this.connection({ type: "heartbeat", file });
    if (this.beatTimer) clearTimeout(this.beatTimer);
    if (this.config.pollMs !== 0) this.beatTimer = setTimeout(() => this.connection({ type: "heartbeatLost" }), HEARTBEAT_LOST_MS);
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
    return [{ projectId: project.id, name: project.name, path: this.folder, bytes: 0, syncing: status.running && status.mode === "sync" }];
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
