// The in-memory DataSource. It carries the prototype's data and logic exactly: the people, the
// 30-item wall, the stages as seed functions built from the prototype's sync(), and the state
// its screens change (published, approved, fixed, saved, invited, joinStep). simulateSave and
// simulateJoin emit the same events a real save or sign in will, so screens never know the
// difference. Ported from the Component class at the end of handoff/v8/Nkata App v8.dc.html.
import type { DataEvent, DataSource, Unsubscribe } from "../DataSource";
import { isApproved, slug } from "../rules";
import { DEFAULT_BUDGETS, type Asset, type Budgets, type Check, type CheckKey, type Comment, type DeletedProject, type Facts, type Journey, type Member, type Mention, type Person, type Project, type Role, type Studio, type StudioRef, type Version } from "../types";
import { ENV, GLB, items, OLD_NOTES, OWNERS, PREV_TRIS, RENDER, SAMPLE, TIMES, TRIS } from "./items";
import { ME, PEOPLE, isLead, type Key } from "./people";

export type Stage = "nostudio" | "noproject" | "arrival" | "empty" | "joining" | "firstsave" | "firstcomment" | "studio";
export type TweakRole = "lead" | "artDirector" | "artist" | "viewer";
export const STAGES: Stage[] = ["nostudio", "noproject", "arrival", "empty", "joining", "firstsave", "firstcomment", "studio"];
export const TWEAK_ROLES: TweakRole[] = ["lead", "artDirector", "artist", "viewer"];

export const RISING_SUN: Project = { id: "rising-sun", name: "Rising Sun", color: "var(--swatch-1)" };
export const TRY_NKATA: Project = { id: "try-nkata", name: "Try Nkata", color: "var(--swatch-2)", sample: true };
export const BUDGET = DEFAULT_BUDGETS.prop;
/** Rising Sun's lead set props to 50,000: with the defaults, seven seeded props would be over, and the prototype shows one red check. */
export const RISING_SUN_BUDGETS: Budgets = { ...DEFAULT_BUDGETS, prop: 50_000 };
/** The sign in code the mock accepts. Anything else is wrong; five wrong tries use it up. */
export const MOCK_CODE = "123456";

interface Raw {
  name: string; owner: Key; glb: string | null; render: string; isEnv: boolean; group: string;
  version: number; note: string; time: string; today: boolean; live: boolean; approved: boolean;
  waitingOnLead: boolean; mentionsMe: boolean; fails: CheckKey[]; tris: number; prevTris: number | null; tex: number;
}

interface State {
  published: Record<string, string>;
  approved: Record<string, true>;
  changesReq: Record<string, true>;
  fixed: Record<string, true>;
  saved: Record<string, number>;
  /** step: 0 invited, 1 joined, 2 blender, 3 inBlender. A new invite starts at 0; simulateJoin moves it. */
  invited: { email: string; role: Role; step: number }[];
  joinStep: number;
  filled: boolean;
  training: boolean;
  studio: Studio | null;
  createdProject: Project | null;
  comments: Comment[];
  studios: StudioRef[];
  members: { person: Person; role: Role }[];
  names: Record<string, string>;
  colors: Record<string, string>;
  deleted: DeletedProject[];
  budgets: Record<string, Budgets>;
  assetBudgets: Record<string, number>;
  codeTries: number;
  me: Person | null;
}

const checkOf = (key: CheckKey, pass: boolean, sentence: string, fix: string): Check => ({ key, pass, sentence, fix });
const fmt = (n: number): string => n.toLocaleString("en-US");

export function checksFor(facts: Facts, fails: readonly CheckKey[], budget: number = BUDGET): Check[] {
  const over = fails.includes("tris") || facts.tris > budget;
  return [
    checkOf("textures", !fails.includes("textures"), `All ${facts.textures} textures are named right.`, "Rename to the sheet."),
    checkOf("scale", !fails.includes("scale"), "Scale is 1.00, in metres.", "Apply scale so it reads 1.00."),
    checkOf("uv", !fails.includes("uv"), `${facts.uvSets} UV set, no overlap.`, "Unwrap the mesh once."),
    checkOf("tris", !over, over ? `${fmt(facts.tris)} triangles. Budget is ${fmt(budget)}.` : `${fmt(facts.tris)} triangles, within budget.`, "Over budget. Decimate or split the mesh."),
  ];
}

/** Which budget an asset's kind and group draw on. */
export function budgetFor(b: Budgets, kind: "object" | "environment", group: string | null, override?: number): number {
  if (override) return override;
  if (kind === "environment") return b.environment;
  const g = (group ?? "").toLowerCase();
  if (g.startsWith("vehicle")) return b.vehicle;
  if (g.startsWith("character")) return b.character;
  return b.prop;
}

export class MockDataSource implements DataSource {
  stage: Stage = "studio";
  role: TweakRole = "artist";
  me: Person = ME.artist;
  private s!: State;
  private handlers = new Set<(e: DataEvent) => void>();

  constructor(opts: { stage?: Stage; role?: TweakRole } = {}) {
    this.seed(opts.stage ?? "studio", opts.role ?? "artist");
  }

  /** The prototype's sync(): one state per stage, nothing carried over. */
  seed(stage: Stage, role: TweakRole): void {
    this.stage = stage;
    this.role = role;
    this.me = ME[role];
    this.s = {
      published: {}, approved: {}, changesReq: {}, fixed: {}, saved: {}, invited: [],
      joinStep: stage === "studio" ? 4 : stage === "arrival" || stage === "empty" ? 0 : 3,
      filled: stage === "firstsave" || stage === "firstcomment",
      training: true,
      studio: stage === "nostudio" ? null : { id: "sunburst", name: "Sunburst", training: true },
      createdProject: null,
      comments: [],
      studios: stage === "nostudio" ? [] : [{ id: "sunburst", name: "Sunburst", role: this.me.role, projects: 2, current: true }, { id: "ironwood", name: "Ironwood Play", role: "viewer", projects: 1, current: false }],
      members: (["E", "A", "C", "N", "T", "K", "D", "F"] as Key[]).map((k) => ({ person: PEOPLE[k], role: PEOPLE[k].role })),
      names: {},
      colors: {},
      deleted: [],
      budgets: { [RISING_SUN.id]: RISING_SUN_BUDGETS },
      assetBudgets: {},
      codeTries: 0,
      me: null,
    };
  }

  subscribe(handler: (e: DataEvent) => void): Unsubscribe {
    this.handlers.add(handler);
    return () => { this.handlers.delete(handler); };
  }
  private emit(e: DataEvent): void { for (const h of this.handlers) h(e); }

  // ---- the wall, as renderVals() builds it

  private raws(): Raw[] {
    const stage = this.stage;
    const me = this.me;
    let all: Raw[] = items().map((it, i) => {
      const o = OWNERS[i % 6]!;
      const live = (o === "A" || o === "C") && (i === 0 || i === 1);
      const approved = i % 4 === 2 || (i > 14 && i % 3 === 0);
      return {
        name: it.name, owner: o, glb: it.model ? GLB(it.model) : null, render: RENDER(it.render ?? "ground"), isEnv: it.isEnv,
        group: it.isEnv ? "Environments" : "Props", version: ((i * 7) % 5) + 1, note: it.note, time: TIMES[Math.min(12, Math.floor(i / 2.4))]!,
        today: i < 9, live, approved, waitingOnLead: !approved && !live && i % 3 === 1, mentionsMe: i === 1 || i === 5,
        fails: i === 12 ? ["tris"] : [], tris: TRIS[i % 7]!, prevTris: PREV_TRIS[i % 7] ?? null, tex: 2 + (i % 2),
      };
    });
    if (stage === "arrival" || stage === "empty" || stage === "nostudio" || stage === "noproject") all = [];
    // The prototype hands the three joining cards to Ada; here they are the team's work, so the
    // slim "Your turn" bar and the journey's third step mean something (docs/decisions.md, v8 step 7).
    else if (stage === "joining") all = all.slice(0, 3).map((a, i) => ({ ...a, owner: (["C", "N", "T"] as Key[])[i]!, live: false }));
    // The prototype reuses all[1] (Chair, Chidi's) under the name Market lantern. The owner is Ada
    // here and the model is the lantern: this stage is Ada's first save (docs/decisions.md, v8 step 2).
    else if (stage === "firstsave" || stage === "firstcomment") all = [{ ...all[1]!, name: "Market lantern", owner: "A", glb: GLB("Lantern"), version: 1, note: "", live: true, approved: false, waitingOnLead: false, time: "Just now", prevTris: null, mentionsMe: stage === "firstcomment" }];
    if (this.s.filled && !all.length) all = [{ name: "Market lantern", owner: "A", glb: GLB("Lantern"), render: RENDER("ground"), isEnv: false, group: "Props", version: 1, note: "", time: "Just now", today: true, live: true, approved: false, waitingOnLead: false, mentionsMe: false, fails: [], tris: 16200, prevTris: null, tex: 2 }];
    const s = this.s;
    all = all.map((a) => {
      const o = { ...a };
      if (s.fixed[a.name]) o.fails = [];
      const pub = s.published[a.name];
      if (pub !== undefined) { o.note = pub; o.version = a.version + 1; o.time = "Just now"; o.today = true; o.live = false; o.waitingOnLead = true; }
      if (s.approved[a.name]) { o.approved = true; o.waitingOnLead = false; }
      if (s.changesReq[a.name]) { o.approved = false; o.waitingOnLead = false; }
      if (s.saved[a.name]) { o.time = "Just now"; o.today = true; o.live = true; }
      return o;
    });
    // The lead's own name never owns a card; the artist is Ada. Used by Mine.
    void me;
    return all;
  }

  private sampleRaw(): Raw {
    return { name: SAMPLE.name, owner: "A", glb: GLB("Lantern"), render: RENDER("ground"), isEnv: false, group: "Props", version: 2, note: SAMPLE.note, time: SAMPLE.time, today: false, live: false, approved: true, waitingOnLead: false, mentionsMe: false, fails: [], tris: SAMPLE.tris, prevTris: SAMPLE.prevTris, tex: SAMPLE.tex };
  }

  private toAsset(r: Raw, projectId: string): Asset {
    const V = r.version;
    const facts: Facts = { tris: r.tris, textures: r.tex, scale: "1.00", uvSets: 1 };
    const assetId = `${projectId}/${slug(r.name)}`;
    const budget = budgetFor(this.s.budgets[projectId] ?? DEFAULT_BUDGETS, r.isEnv ? "environment" : "object", r.group, this.s.assetBudgets[assetId]);
    const versions: Version[] = [];
    for (let n = V; n >= 1; n--) {
      const isCurrent = n === V;
      const note = isCurrent ? r.note : OLD_NOTES[Math.min(3, n - 1)]!;
      const v: Version = {
        n, note, publishedAt: isCurrent ? r.time : `${V - n} wk ago`,
        checks: isCurrent ? checksFor(facts, r.fails, budget) : checksFor({ ...facts, tris: r.prevTris ?? r.tris }, [], budget),
        // A published Version with no decision waits on a lead. The prototype marks a third of the
        // wall as waiting; the rest were sent back once, which is what changesRequested records.
        approved: isCurrent && r.approved, changesRequested: isCurrent && (!!this.s.changesReq[r.name] || (!r.approved && !r.live && !r.waitingOnLead && !!r.note)),
      };
      if (isCurrent) v.facts = facts;
      else if (n === V - 1 && r.prevTris !== null) v.facts = { ...facts, tris: r.prevTris };
      versions.push(v);
    }
    return {
      id: assetId, name: r.name, kind: r.isEnv ? "environment" : "object", group: r.group, ...(this.s.assetBudgets[assetId] ? { budget: this.s.assetBudgets[assetId] } : {}),
      owner: PEOPLE[r.owner], ...(r.glb ? { glb: r.glb } : {}), ...(r.isEnv ? { render: r.render } : {}),
      ...(r.live ? { live: { savedAt: r.time } } : {}), versions, ...(r.mentionsMe ? { mentionsMe: true } : {}),
      changedAt: r.time, today: r.today,
    };
  }

  private rawByName(name: string): Raw | undefined {
    return name === SAMPLE.name ? this.sampleRaw() : this.raws().find((a) => a.name === name);
  }

  private nameOf(assetId: string): string | null {
    const [, slugPart] = assetId.split("/");
    if (!slugPart) return null;
    if (slug(SAMPLE.name) === slugPart) return SAMPLE.name;
    return this.raws().find((a) => slug(a.name) === slugPart)?.name ?? null;
  }

  // ---- reads

  async getStudio(): Promise<Studio | null> { return this.s.studio ? { ...this.s.studio, training: this.s.training } : null; }

  async listProjects(): Promise<Project[]> {
    if (!this.s.studio) return [];
    const fresh = this.stage === "noproject" || this.stage === "nostudio";
    if (fresh && !this.s.createdProject) return [];
    const list: Project[] = fresh ? [] : [RISING_SUN];
    if (this.s.createdProject) list.push(this.s.createdProject);
    list.push(TRY_NKATA);
    const gone = new Set(this.s.deleted.map((d) => d.id));
    return list.filter((p) => !gone.has(p.id)).map((p) => ({ ...p, ...(this.s.names[p.id] ? { name: this.s.names[p.id]! } : {}), ...(this.s.colors[p.id] ? { color: this.s.colors[p.id]! } : {}) }));
  }

  async getProject(id: string): Promise<Project | null> { return (await this.listProjects()).find((p) => p.id === id) ?? null; }

  async listAssets(projectId: string): Promise<Asset[]> {
    if (projectId === TRY_NKATA.id) return [this.toAsset(this.sampleRaw(), projectId)];
    if (projectId === RISING_SUN.id) return this.raws().map((r) => this.toAsset(r, projectId));
    return [];
  }

  async getAsset(id: string): Promise<Asset | null> {
    const [projectId] = id.split("/");
    const name = this.nameOf(id);
    if (!projectId || !name) return null;
    const raw = this.rawByName(name);
    return raw ? this.toAsset(raw, projectId) : null;
  }

  async listComments(assetId: string): Promise<Comment[]> {
    const [projectId] = assetId.split("/");
    const seed: Comment[] = projectId === TRY_NKATA.id
      ? [
        { id: "c1", assetId, version: 2, author: PEOPLE.E, text: "Roof reads too stiff. Loosen the ridge.", pin: [0, 8, 2], at: "3 days ago" },
        { id: "c2", assetId, version: 2, author: PEOPLE.A, text: "Loosened. Crates stacked two high too.", at: "3 days ago" },
        { id: "c3", assetId, version: 2, author: PEOPLE.F, text: "The awning colour is right for Enugu. Keep it.", pin: [-2, 5, 1], at: "2 days ago" },
      ]
      : this.stage === "firstcomment"
        ? [{ id: "c1", assetId, version: "live", author: PEOPLE.E, text: "Roof reads too stiff. Loosen the ridge.", pin: [0, 8, 2], at: "Just now" }]
        : this.stage === "studio"
          ? [{ id: "c1", assetId, version: 1, author: PEOPLE.E, text: "The chairs read too new for this yard.", pin: [0.4, 0.3, 0.5], at: "1 h ago" }]
          : [];
    return seed.concat(this.s.comments.filter((c) => c.assetId === assetId));
  }

  async listMentions(projectId: string): Promise<Mention[]> {
    const assets = await this.listAssets(projectId);
    const lead = isLead(this.me.role);
    const mine = assets.filter((a) => (lead ? (this.waiting(a) || !!a.mentionsMe) : !!a.mentionsMe)).slice(0, 6);
    const whens = ["12 min ago", "1 h ago", "3 h ago", "Yesterday", "Yesterday", "2 days ago"];
    return mine.map((a, i) => {
      const waits = lead && this.waiting(a);
      return {
        id: `m-${a.id}`, asset: a, who: waits ? a.owner : PEOPLE.E, verb: waits ? "published, for you to approve" : "pinned on",
        text: waits ? (a.versions[0]?.note ?? "") : "Roof reads too stiff. Loosen the ridge.", when: whens[i] ?? "2 days ago",
        px: ["58%", "40%", "62%"][i % 3]!, py: ["40%", "55%", "36%"][i % 3]!,
      };
    });
  }

  private waiting(a: Asset): boolean {
    const v = a.versions[0];
    return !!v && !!v.note && !v.approved && !v.changesRequested && !a.live;
  }

  /** The team strip. Steps: 0 invited, 1 joined, 2 blender, 3 inBlender (the prototype's). */
  async listMembers(_projectId: string): Promise<Member[]> {
    const stage = this.stage;
    const base: { k: Key; step: number }[] = stage === "studio"
      ? (["E", "A", "C", "N", "T", "K", "D", "F"] as Key[]).map((k, i) => ({ k, step: i < 4 ? 3 : i < 7 ? 2 : 1 }))
      : stage === "arrival" || stage === "empty" || stage === "nostudio" || stage === "noproject"
        ? [{ k: "E", step: 2 }]
        : [{ k: "E", step: 2 }, { k: "A", step: Math.min(3, this.s.joinStep) }];
    const steps: Journey[] = ["invited", "joined", "blender", "inBlender"];
    const members: Member[] = base.map(({ k, step }) => ({ person: PEOPLE[k], journey: steps[Math.min(3, step)]! }));
    for (const inv of this.s.invited) {
      const initial = inv.email.charAt(0).toUpperCase();
      members.push({ person: { id: `invite-${inv.email}`, first: inv.email, name: inv.email, initial, color: "var(--p-slate)", role: inv.role, email: inv.email }, journey: steps[Math.max(0, Math.min(3, inv.step))]! });
    }
    return members;
  }

  // ---- writes

  async invite(_projectId: string, email: string, role: Role): Promise<Member> {
    const e = email.trim();
    this.s.invited.push({ email: e, role, step: 0 });
    this.s.joinStep = Math.max(this.s.joinStep, 1);
    const member = (await this.listMembers(_projectId)).find((m) => m.person.email === e)!;
    this.emit({ type: "memberChanged", personId: member.person.id, journey: member.journey });
    return member;
  }

  async publish(assetId: string, note: string, noteEngineering?: string): Promise<void> {
    const name = this.nameOf(assetId);
    const asset = await this.getAsset(assetId);
    if (!name || !asset) throw new Error("no asset");
    const v = asset.versions[0];
    if (!note.trim()) throw new Error("Write one line first.");
    if (v && v.checks.some((c) => !c.pass)) throw new Error("Fix the red check first.");
    void noteEngineering;
    this.s.published[name] = note.trim();
    delete this.s.approved[name];
    delete this.s.changesReq[name];
    this.s.saved = {};
    this.emit({ type: "published", assetId, version: (v?.n ?? 0) + 1 });
  }

  async approve(assetId: string, version: number): Promise<void> {
    const name = this.nameOf(assetId);
    if (!name) throw new Error("no asset");
    this.s.approved[name] = true;
    delete this.s.changesReq[name];
    this.emit({ type: "approved", assetId, version });
  }

  async requestChanges(assetId: string, version: number): Promise<void> {
    const name = this.nameOf(assetId);
    if (!name) throw new Error("no asset");
    this.s.changesReq[name] = true;
    delete this.s.approved[name];
    this.emit({ type: "changesRequested", assetId, version });
  }

  async comment(assetId: string, text: string, pin?: [number, number, number]): Promise<Comment> {
    const asset = await this.getAsset(assetId);
    const c: Comment = { id: `u${Date.now()}-${this.s.comments.length}`, assetId, version: asset?.live ? "live" : (asset?.versions[0]?.n ?? 1), author: this.me, text: text.trim(), ...(pin ? { pin } : {}), at: "Just now" };
    this.s.comments.push(c);
    this.emit({ type: "commented", assetId, commentId: c.id });
    return c;
  }

  async fixCheck(assetId: string, _key: CheckKey): Promise<void> {
    const name = this.nameOf(assetId);
    if (!name) throw new Error("no asset");
    this.s.fixed[name] = true;
    this.emit({ type: "saved", assetId, by: this.me.id });
  }

  async createStudio(name: string): Promise<Studio> {
    this.s.studio = { id: slug(name) || "studio", name: name.trim() || "Sunburst", training: this.s.training };
    return this.s.studio;
  }

  async createProject(name: string, color: string): Promise<Project> {
    const n = name.trim() || "New project";
    const taken = (await this.listProjects()).map((p) => p.id);
    let id = slug(n) || "project";
    for (let i = 2; taken.includes(id); i++) id = `${slug(n)}-${i}`;
    this.s.createdProject = { id, name: n, color };
    this.s.filled = false;
    return this.s.createdProject;
  }

  async setTraining(on: boolean): Promise<void> { this.s.training = on; if (this.s.studio) this.s.studio = { ...this.s.studio, training: on }; }
  async openInBlender(_assetId: string, _version?: number): Promise<void> { /* the mock has no Blender */ }
  async download(assetId: string, format: "glb" | "fbx" | "image", version?: number): Promise<string> {
    const asset = await this.getAsset(assetId);
    const v = version ?? asset?.versions[0]?.n ?? 1;
    return `${slug(asset?.name ?? "asset").replace(/-/g, "_")}_v${v}.${format === "image" ? "png" : format}`;
  }

  // ---- account and studio

  async requestCode(email: string): Promise<{ sent: true; code?: string }> {
    void email;
    this.s.codeTries = 0;
    return { sent: true, code: MOCK_CODE };
  }
  async redeemCode(email: string, code: string): Promise<Person> {
    if (this.s.codeTries >= 5) throw new Error("used up");
    if (code !== MOCK_CODE) { this.s.codeTries++; throw new Error(this.s.codeTries >= 5 ? "used up" : "wrong"); }
    const known = Object.values(PEOPLE).find((p) => `${p.first.toLowerCase()}@sunburst.studio` === email.trim().toLowerCase());
    this.s.me = known ?? { ...this.me, email: email.trim().toLowerCase(), first: "", name: "" };
    return this.s.me;
  }
  async signOut(): Promise<void> { this.s.me = null; }
  async setMe(name: string): Promise<Person> {
    const n = name.trim();
    this.me = { ...this.me, name: n, first: n.split(" ")[0] ?? n, initial: (n.charAt(0) || "?").toUpperCase() };
    return this.me;
  }
  async listStudios(): Promise<StudioRef[]> { return this.s.studios; }
  async switchStudio(id: string): Promise<void> {
    const target = this.s.studios.find(x => x.id === id);
    if (!target) throw new Error("no studio");
    this.s.studios = this.s.studios.map((x) => ({ ...x, current: x.id === id }));
    this.s.studio = { id: target.id, name: target.name, training: this.s.training };
    this.me = { ...this.me, role: target.role };
  }
  async setStudioName(name: string): Promise<void> {
    if (!this.s.studio) return;
    this.s.studio = { ...this.s.studio, name: name.trim() || this.s.studio.name };
    this.s.studios = this.s.studios.map((x) => (x.current ? { ...x, name: this.s.studio!.name } : x));
  }
  async listStudioMembers(): Promise<Member[]> {
    const journeys = await this.listMembers(RISING_SUN.id);
    const inv = this.s.invited.map((i) => ({ person: { id: `invite-${i.email}`, first: i.email, name: i.email, initial: i.email.charAt(0).toUpperCase(), color: "var(--p-slate)", role: i.role, email: i.email }, journey: journeys.find((j) => j.person.email === i.email)?.journey ?? ("invited" as Journey) }));
    return this.s.members.map((m) => ({ person: { ...m.person, role: m.role }, journey: journeys.find((j) => j.person.id === m.person.id)?.journey ?? "joined" })).concat(inv);
  }
  private producersLeftWithout(personId: string, role?: Role): number {
    return this.s.members.filter((m) => (m.person.id === personId ? role === "producer" : m.role === "producer")).length;
  }
  async setMemberRole(personId: string, role: Role): Promise<void> {
    if (this.producersLeftWithout(personId, role) === 0) throw new Error("A studio keeps at least one producer.");
    this.s.members = this.s.members.map((m) => (m.person.id === personId ? { ...m, role } : m));
    if (personId === this.me.id) this.me = { ...this.me, role };
    this.emit({ type: "memberChanged", personId, journey: "joined" });
  }
  async removeMember(personId: string): Promise<void> {
    if (this.producersLeftWithout(personId) === 0) throw new Error("A studio keeps at least one producer.");
    this.s.members = this.s.members.filter((m) => m.person.id !== personId);
    this.s.invited = this.s.invited.filter((i) => `invite-${i.email}` !== personId);
    this.emit({ type: "memberChanged", personId, journey: "invited" });
  }
  async renameProject(id: string, name: string): Promise<void> { this.s.names[id] = name.trim() || (await this.getProject(id))?.name || "Project"; }
  async setProjectColor(id: string, color: string): Promise<void> { this.s.colors[id] = color; }
  async deleteProject(id: string): Promise<void> {
    const p = await this.getProject(id);
    if (!p) return;
    this.s.deleted.push({ id, name: p.name, deletedAt: "Just now" });
  }
  async listDeletedProjects(): Promise<DeletedProject[]> { return this.s.deleted; }
  async restoreProject(id: string): Promise<void> { this.s.deleted = this.s.deleted.filter((d) => d.id !== id); }
  async getBudgets(projectId: string): Promise<Budgets> { return this.s.budgets[projectId] ?? DEFAULT_BUDGETS; }
  async setBudgets(projectId: string, budgets: Budgets): Promise<number> {
    this.s.budgets[projectId] = budgets;
    const assets = await this.listAssets(projectId);
    return assets.filter((a) => a.versions[0]?.checks.some((c) => c.key === "tris" && !c.pass)).length;
  }
  async setAssetBudget(assetId: string, n: number | null): Promise<void> {
    if (n && n > 0) this.s.assetBudgets[assetId] = n; else delete this.s.assetBudgets[assetId];
  }

  // ---- the Tweaks' simulations, through the same events as a real save or sign in

  /** A save lands: in an empty project the Market lantern appears; on the wall the first live card saves again. */
  async simulateSave(): Promise<string> {
    const had = this.raws();
    let target = had.find((a) => a.name === "Market stall") ?? had.find((a) => a.owner === "A") ?? had[0];
    if (!target) { this.s.filled = true; target = this.raws()[0]; }
    if (!target) throw new Error("nothing to save into");
    this.s.filled = true;
    this.s.saved[target.name] = Date.now();
    this.s.joinStep = Math.max(this.s.joinStep, 4);
    const assetId = `${RISING_SUN.id}/${slug(target.name)}`;
    this.emit({ type: "saved", assetId, by: this.role === "artist" ? this.me.id : PEOPLE.A.id });
    return assetId;
  }

  /** One member moves one step forward along the journey. */
  async simulateJoin(): Promise<void> {
    const pending = this.s.invited.find((i) => i.step < 3);
    if (pending) pending.step++; else this.s.joinStep = Math.min(4, this.s.joinStep + 1);
    const members = await this.listMembers(RISING_SUN.id);
    const moved = (pending ? members.find((m) => m.person.email === pending.email) : null) ?? members.find((m) => m.person.id === "A") ?? members[0];
    if (moved) this.emit({ type: "memberChanged", personId: moved.person.id, journey: moved.journey });
  }

  /** First run, artist: the three setup rows tick 700 ms apart, as events, never a timer in the UI. */
  startArrivalSetup(): void {
    const rows: { step: "blender" | "addon" | "project"; meta: string }[] = [{ step: "blender", meta: "4.2.3" }, { step: "addon", meta: "" }, { step: "project", meta: "Show in Finder" }];
    rows.forEach((r, i) => setTimeout(() => this.emit({ type: "setup", step: r.step, meta: r.meta }), 700 * (i + 1)));
  }

  /** For tests: the approved count the prototype shows. */
  approvedCount(assets: readonly Asset[]): number { return assets.filter(isApproved).length; }
}
