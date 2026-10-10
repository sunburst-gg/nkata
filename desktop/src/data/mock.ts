// Sunburst, in memory, behind DataSource. Content from handoff/v3/Nkata App v3.dc.html: the
// studio, two projects, six assets, seven people. Four demo stages of the first run (fresh,
// connected, firstAsset, populated) reach every state the prototype's Tweaks reach.
import type { Role } from "@/auth/permissions";
import type { ActivityItem, Asset, AskAnswer, Check, Comment, Connection, ConnectionId, DataSource, DemoStage, Mention, Part, Person, Project, RenderKey, Snapshot, Studio, Template, Training, TrainingEntry, Version } from "./types";

/** The Khronos Duck, bundled. Every mock asset loads it so the viewer works offline. */
export const SAMPLE_MODEL = "/models/Duck.glb";

const P = {
  emmanuel: { id: "emmanuel", name: "Emmanuel Njoku", initial: "E", tone: 9, title: "Producer", role: "producer", email: "nj@njokuscript.com", presence: "online", where: "On the project view", seen: "now" },
  ada: { id: "ada", name: "Ada Okafor", initial: "A", tone: 1, title: "Artist", role: "artist", email: "ada@sunburst.studio", presence: "online", where: "In Market stall / model, Blender", seen: "now" },
  chidi: { id: "chidi", name: "Chidi Eze", initial: "C", tone: 2, title: "Artist", role: "artist", email: "chidi@sunburst.studio", presence: "online", where: "In Ojukwu / cloth, Blender", seen: "now" },
  ngozi: { id: "ngozi", name: "Ngozi Bello", initial: "N", tone: 6, title: "Artist", role: "artist", email: "ngozi@sunburst.studio", presence: "offline", where: "", seen: "1 d" },
  emeka: { id: "emeka", name: "Emeka Obi", initial: "E", tone: 4, title: "Art director", role: "art_director", email: "emeka@sunburst.studio", presence: "offline", where: "", seen: "2 h" },
  tobe: { id: "tobe", name: "Tobe Nwosu", initial: "T", tone: 5, title: "Artist", role: "artist", email: "tobe@sunburst.studio", presence: "online", where: "In Compound / interior, Unreal", seen: "now" },
  ify: { id: "ify", name: "Ify Umeh", initial: "I", tone: 7, title: "Viewer", role: "viewer", email: "ify@sunburst.studio", presence: "offline", where: "", seen: "3 d" },
} satisfies Record<string, Person>;

const r = (key: RenderKey, pos = "center") => ({ key, pos });
const WHEN = ["Today", "Today", "Yesterday", "Mon"];
const RENDERS: RenderKey[] = ["ground", "courtyard", "tree", "interior"];

function versions(part: string, top: number, author: string): Version[] {
  const out: Version[] = [];
  for (let n = top, i = 0; n >= 1 && i < 4; n--, i++) {
    out.push({ id: `${part}-v${n}`, n, note: i === 0 ? "current" : "", render: r(RENDERS[i]!), authorId: author, when: WHEN[i]!, mirror: "synced" });
  }
  return out;
}

function checks(): Check[] {
  return [
    { id: "scale", name: "Scale", detail: "Applied, 1.0", status: "pass", blocks: false, fixable: false },
    { id: "tris", name: "Triangles", detail: "18,400 of 30,000", status: "pass", blocks: false, fixable: false },
    { id: "tex", name: "Textures", detail: "1 texture over 2048. Nkata can resize it.", status: "fail", blocks: true, fixable: true, fixedDetail: "Resized to 2048." },
    { id: "naming", name: "Naming", detail: "market_stall_model", status: "pass", blocks: false, fixable: false },
  ];
}

const part = (name: string, state: Part["state"], ownerId: string, render: RenderKey, extra: Partial<Part> = {}): Part => ({
  id: name,
  name,
  state,
  ownerId,
  render: r(render),
  lock: null,
  gate: [],
  versions: versions(name, 3, ownerId),
  checks: checks(),
  comments: [],
  mirror: { state: "synced", seconds: 4 },
  refs: [],
  ...extra,
});

const ojukwuComments: Comment[] = [
  { id: "c1", n: 1, authorId: "emeka", partName: "face", when: "2 h ago", text: "Left eye socket is too deep. Approve after fix.", resolved: false, kind: "pin", source: "Nkata", pos: [-0.65, 0.3, 0.6] },
  { id: "c2", n: 2, authorId: "ada", partName: "face", when: "3 h ago", text: "Fixed the strap. Take a look when you have a minute.", resolved: false, kind: "take_a_look", source: "Nkata" },
];
const stallComments: Comment[] = [
  { id: "c3", n: 1, authorId: "emeka", partName: "model", when: "2 h ago", text: "Beak reads too clean for a market stall. Add wear.", resolved: false, kind: "pin", source: "Nkata", pos: [-40, 110, 20] },
];

type AssetSeed = { name: string; kind: Asset["kind"]; state: Asset["state"]; img: RenderKey; who: string[]; when: string; syncIssue?: boolean; parts: Part[]; comments?: Comment[]; meta: string };

function seedAssets(projectSlug: string, stage: DemoStage): Asset[] {
  const stall: AssetSeed = { name: "Market stall", kind: "Props", state: "draft", img: "ground", who: ["ada"], when: "4 s ago", parts: [part("model", "draft", "ada", "ground", { comments: stallComments.map((c) => ({ ...c })) })], meta: "Prop · 1 part · Ada" };
  const all: AssetSeed[] = [
    stall,
    { name: "Ojukwu", kind: "Characters", state: "ready", img: "courtyard", who: ["ada", "chidi"], when: "12 min ago", meta: "Character · 6 parts · Ada", parts: [
      part("face", "draft", "ada", "courtyard", { comments: ojukwuComments.map((c) => ({ ...c })) }),
      part("cloth", "ready", "chidi", "ground"),
      part("hair", "draft", "ada", "tree"),
      part("textures", "locked", "ngozi", "interior", { gate: ["face", "cloth", "hair"], versions: [] }),
      part("rig", "locked", "tobe", "overview", { gate: ["textures"], versions: [] }),
      part("lookdev", "locked", "ada", "courtyard", { gate: ["rig"], versions: [] }),
    ] },
    { name: "Enugu Market", kind: "Levels", state: "approved", img: "overview", who: [], when: "2 h ago", meta: "Level · 1 part · Tobe", parts: [part("square", "approved", "tobe", "overview")] },
    { name: "Compound", kind: "Levels", state: "draft", img: "interior", who: ["tobe"], when: "3 h ago", syncIssue: true, meta: "Level · 1 part · Tobe", parts: [part("interior", "draft", "tobe", "interior", { mirror: { state: "failed", seconds: 0 } })] },
    { name: "Kettle", kind: "Props", state: "approved", img: "tree", who: [], when: "Yesterday", meta: "Prop · 1 part · Tobe", parts: [part("model", "approved", "tobe", "tree")] },
    { name: "Ngozi", kind: "Characters", state: "ready", img: "courtyard", who: ["ngozi"], when: "Yesterday", meta: "Character · 1 part · Ngozi", parts: [part("face", "ready", "ngozi", "courtyard")] },
  ];
  const picked = stage === "populated" ? all : stage === "firstAsset" ? [stall] : [];
  return picked.map((a, i) => ({
    id: slugOf(a.name), slug: slugOf(a.name), projectSlug, name: a.name, kind: a.kind, state: a.state, render: r(a.img), meta: a.meta, ownerId: a.parts[0]?.ownerId ?? "ada",
    present: a.who, parts: a.parts, template: a.kind === "Characters" ? "Character" : a.kind === "Props" ? "Environment prop" : "Level area", usedIn: [], changedOrder: i, when: a.when, syncIssue: a.syncIssue, model: SAMPLE_MODEL,
  }));
}

export function slugOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const ACTIVITY: ActivityItem[] = [
  { id: "a1", personId: "ada", text: "published Market stall / model, v3", target: "Market stall / model", when: "4 s ago", dot: "synced", assetSlug: "market-stall", partName: "model" },
  { id: "a2", personId: "emeka", text: "approved Enugu Market / square", target: "Enugu Market / square", when: "2 h ago", dot: "approved", assetSlug: "enugu-market", partName: "square" },
  { id: "a3", personId: "chidi", text: "marked Ojukwu / cloth Ready", target: "Ojukwu / cloth", when: "3 h ago", dot: "ready", assetSlug: "ojukwu", partName: "cloth" },
  { id: "a4", personId: "tobe", text: "opened Compound / interior", target: "Compound / interior", when: "3 h ago", dot: "muted", assetSlug: "compound", partName: "interior" },
  { id: "a5", personId: "ngozi", text: "left a comment on Ojukwu / face", target: "Ojukwu / face", when: "Yesterday", dot: "muted", assetSlug: "ojukwu", partName: "face" },
];

const MENTIONS: Mention[] = [
  { id: "m1", authorId: "emeka", on: "Ojukwu / face", assetSlug: "ojukwu", partName: "face", when: "2 h ago", text: "Emmanuel, can you remove the gate on textures so Ngozi can start?" },
  { id: "m2", authorId: "ada", on: "Market stall / model", assetSlug: "market-stall", partName: "model", when: "Yesterday", text: "Emmanuel, the folder moved. Is the path still right?" },
];

const TEMPLATES: Template[] = [
  { id: "character", name: "Character", usedBy: 2, tools: "Blender · Unreal · skeletal mesh", parts: [
    { id: "t1", name: "face", gate: [], checks: ["Scale", "Naming", "Triangles"], refs: 0 }, { id: "t2", name: "cloth", gate: [], checks: ["Scale", "Naming"], refs: 0 }, { id: "t3", name: "hair", gate: [], checks: ["Scale", "Naming"], refs: 0 },
    { id: "t4", name: "textures", gate: ["face", "cloth", "hair"], checks: ["Texture size"], refs: 0 }, { id: "t5", name: "rig", gate: ["textures"], checks: ["Rig names"], refs: 0 }, { id: "t6", name: "lookdev", gate: ["rig"], checks: [], refs: 0 },
  ] },
  { id: "prop", name: "Environment prop", usedBy: 2, tools: "Blender · Unreal · static mesh", parts: [
    { id: "p1", name: "concept", gate: [], checks: [], refs: 0 }, { id: "p2", name: "model", gate: [], checks: ["Scale", "Naming", "Triangles", "Pivot at base"], refs: 0 }, { id: "p3", name: "uvs", gate: [], checks: ["UV set"], refs: 0 },
    { id: "p4", name: "textures", gate: [], checks: ["Texture size"], refs: 0 }, { id: "p5", name: "lods", gate: [], checks: ["LODs"], refs: 0 }, { id: "p6", name: "collision", gate: [], checks: ["Collision"], refs: 0 },
  ] },
  { id: "level", name: "Level area", usedBy: 2, tools: "Unreal · One File Per Actor", parts: [
    { id: "l1", name: "blockout", gate: [], checks: ["Scale"], refs: 0 }, { id: "l2", name: "layout", gate: [], checks: ["Naming"], refs: 0 }, { id: "l3", name: "set_dressing", gate: [], checks: ["Naming"], refs: 0 }, { id: "l4", name: "lighting", gate: [], checks: [], refs: 0 },
  ] },
];

const CONNECTION_DEFS: { id: ConnectionId; name: string; soon: boolean; version?: string; found: string; connected: string }[] = [
  { id: "blender", name: "Blender", soon: false, version: "5.1.2", found: "Blender 5.1.2 is on this computer. Connect adds the Nkata panel.", connected: "Blender 5.1.2. The Nkata panel is in the sidebar, press N." },
  { id: "unreal", name: "Unreal Engine", soon: false, version: "5.8.1", found: "Unreal 5.8.1 is on this computer. Connect adds the Nkata tab to your project.", connected: "Unreal 5.8.1. The Nkata tab is in the editor." },
  { id: "discord", name: "Discord", soon: false, found: "A message when a part is sent back or approved. A recap every evening.", connected: "A message when a part is sent back or approved. A recap every evening." },
  { id: "linear", name: "Linear", soon: true, found: "Turn a pinned comment into an issue.", connected: "" },
  { id: "substance", name: "Substance", soon: true, found: "Textures and materials.", connected: "" },
  { id: "maya", name: "Maya", soon: true, found: "Modeling and rigging.", connected: "" },
  { id: "houdini", name: "Houdini", soon: true, found: "Procedural assets.", connected: "" },
  { id: "unity", name: "Unity", soon: true, found: "A second engine.", connected: "" },
  { id: "godot", name: "Godot", soon: true, found: "A second engine.", connected: "" },
];

function project(name: string, tone: Project["tone"], assetCount: number): Project {
  return { id: slugOf(name), slug: slugOf(name), name, tone, createdLabel: "Created 10 Oct 2026", ownerId: "emmanuel", assetCount, changed: "", renders: [], present: [], folder: `~/Documents/Nkata/${name}`, blender: "5.1.2", unreal: "5.8.1", inviteLink: `nkata://join/${slugOf(name)}`, sizeLabel: "" };
}

export interface MockOptions {
  stage?: DemoStage;
  role?: "artist" | "viewer";
}

export interface MockSource extends DataSource {
  /** Jumps to a demo stage of the first run. The screens re-read everything. */
  setStage(stage: DemoStage): void;
  stage(): DemoStage;
}

export function createMockSource(initial: MockOptions | "artist" | "viewer" = {}): MockSource {
  const opts: MockOptions = typeof initial === "string" ? { role: initial } : initial;
  const listeners = new Set<() => void>();
  let stage: DemoStage = opts.stage ?? "fresh";
  let people: Person[] = Object.values(P).map((p) => ({ ...p }));
  let projects: Project[] = [];
  let assetList: Asset[] = [];
  let activity: ActivityItem[] = [];
  let mentions: Mention[] = [];
  let connected: Record<ConnectionId, boolean> = { blender: false, unreal: false, discord: false, linear: false, substance: false, maya: false, houdini: false, unity: false, godot: false };
  let training: Training = "on";
  let trainingLog: TrainingEntry[] = [{ when: "10 Oct 2026", text: "Training on. Studio created by Emmanuel Njoku" }];
  let studioName = "Sunburst";
  let me: Person = people.find((p) => p.id === (opts.role === "viewer" ? "ify" : "emmanuel"))!;
  let theme: "dark" | "light" = "light";
  let nextComment = 10;
  let nextActivity = 100;

  const emit = () => listeners.forEach((fn) => fn());

  function applyStage(next: DemoStage): void {
    stage = next;
    const populated = next === "populated";
    projects = next === "fresh" ? [] : populated ? [project("NkataTest", 5, 1), project("Rising Sun", 4, 6)] : [project("NkataTest", 5, next === "firstAsset" ? 1 : 0)];
    const test = slugOf("NkataTest");
    assetList = populated ? [...seedAssets(test, "firstAsset"), ...seedAssets(slugOf("Rising Sun"), "populated")] : seedAssets(test, next);
    connected = { ...connected, blender: next !== "fresh", unreal: next !== "fresh", discord: populated };
    activity = populated || next === "firstAsset" ? ACTIVITY.map((a) => ({ ...a })) : [];
    mentions = populated ? MENTIONS.map((m) => ({ ...m })) : [];
    people = Object.values(P).filter((p) => populated || !["tobe", "ify"].includes(p.id)).map((p) => ({ ...p }));
    me = people.find((p) => p.id === me.id) ?? people[0]!;
  }
  applyStage(stage);

  const studio = (): Studio => ({
    id: "sunburst", name: studioName, initial: (studioName || "S").charAt(0).toUpperCase(), peopleCount: people.length, projects,
    training, billing: { line: training === "on" ? "Nothing to pay" : "Billed per seat", seats: people.length },
  });
  const connections = (): Connection[] => CONNECTION_DEFS.map((c) => ({ id: c.id, name: c.name, soon: c.soon, connected: connected[c.id], version: c.version, line: connected[c.id] ? c.connected : c.found }));
  const findPart = (assetSlug: string, partName: string) => {
    const a = assetList.find((x) => x.slug === assetSlug);
    const p = a?.parts.find((x) => x.name === partName);
    if (!a || !p) throw new Error(`no part ${assetSlug}/${partName}`);
    return { a, p };
  };
  const touch = () => { assetList = [...assetList]; emit(); };
  const log = (text: string, target: string, dot: ActivityItem["dot"], assetSlug: string, partName?: string) => {
    activity = [{ id: `act-${nextActivity++}`, personId: me.id, text, target, when: "Just now", dot, assetSlug, partName }, ...activity];
  };
  const countAssets = () => { projects = projects.map((p) => ({ ...p, assetCount: assetList.filter((a) => a.projectSlug === p.slug).length })); };

  return {
    stage: () => stage,
    setStage: (next) => { applyStage(next); emit(); },
    snapshot: (): Snapshot => ({
      session: { user: me, studio: studio(), theme, digestHome: false },
      people, assets: assetList, activity, templates: TEMPLATES, digests: [], digestIndex: 0, connections: connections(), mentions, trainingLog,
      online: people.filter((p) => p.presence === "online" && p.role !== "viewer").length, changedToday: stage === "populated" ? 12 : assetList.length, changedThisWeek: stage === "populated" ? 12 : assetList.length,
    }),
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    signIn: (as) => { me = people.find((p) => p.id === (as === "viewer" ? "ify" : "emmanuel")) ?? me; emit(); },
    signOut: () => emit(),
    setMe: (name, email) => {
      const next = { ...me, name: name.trim() || me.name, initial: (name.trim() || me.name).charAt(0).toUpperCase(), email: email.trim() || me.email };
      people = people.map((p) => (p.id === me.id ? next : p));
      me = next;
      emit();
    },
    createStudio: (name, t) => {
      studioName = name.trim() || "Sunburst";
      training = t;
      trainingLog = [{ when: "10 Oct 2026", text: `Training ${t}. Studio created by ${me.name}` }];
      emit();
    },
    setStudioName: (name) => { studioName = name; emit(); },
    setTraining: (t) => {
      if (t === training) return;
      training = t;
      trainingLog = [{ when: "10 Oct 2026", text: `${t === "on" ? "Training on. Billing stopped. " : "Training off. Billing starts 1 Nov. "}${me.name}` }, ...trainingLog];
      emit();
    },
    createProject: ({ name, folder, blender, unreal }) => {
      const made: Project = { ...project(name.trim() || "NkataTest", 5, 0), folder: folder || `~/Documents/Nkata/${name.trim() || "NkataTest"}`, blender, unreal };
      projects = [...projects, made];
      emit();
      return made;
    },
    renameProject: (slug, name) => { projects = projects.map((p) => (p.slug === slug ? { ...p, name } : p)); emit(); },
    deleteProject: (slug) => {
      projects = projects.filter((p) => p.slug !== slug);
      assetList = assetList.filter((a) => a.projectSlug !== slug);
      emit();
    },
    createAsset: (projectSlug, name, template, parts) => {
      const tpl = TEMPLATES.find((t) => t.name === template) ?? TEMPLATES[1]!;
      const kind: Asset["kind"] = tpl.id === "character" ? "Characters" : tpl.id === "level" ? "Levels" : "Props";
      const chosen = parts === "one" ? [tpl.parts.find((p) => p.name === "model") ?? tpl.parts[0]!] : tpl.parts;
      const made: Asset = {
        id: slugOf(name), slug: slugOf(name), projectSlug, name, kind, state: "draft", render: null, noRenderText: chosen.map((p) => p.name).join(" · "), meta: `${kind.replace(/s$/, "")} · ${chosen.length} part${chosen.length > 1 ? "s" : ""} · ${me.name.split(" ")[0]}`,
        ownerId: me.id, present: [], template: tpl.name, usedIn: [], changedOrder: 0, when: "Just now",
        parts: chosen.map((tp) => ({ id: tp.name, name: tp.name, state: tp.gate.some((g) => chosen.some((c) => c.name === g)) ? "waiting" : "draft", ownerId: me.id, render: null, lock: null, gate: tp.gate.filter((g) => chosen.some((c) => c.name === g)), versions: [], checks: [], comments: [], mirror: { state: "offline", seconds: 0 }, refs: [] })),
      };
      assetList = [made, ...assetList];
      countAssets();
      log(`created ${name}`, name, "draft", made.slug);
      emit();
      // The first save in Blender: a version, a render, and the mirror into Unreal.
      setTimeout(() => {
        const first = made.parts[0];
        if (!first) return;
        first.versions = [{ id: `${first.name}-v1`, n: 1, note: "current", render: r("ground"), authorId: me.id, when: "Just now", mirror: "synced" }];
        first.mirror = { state: "synced", seconds: 4 };
        first.checks = checks().map((c) => ({ ...c, status: "pass", blocks: false, detail: c.fixedDetail ?? c.detail }));
        made.render = r("ground");
        made.model = SAMPLE_MODEL;
        made.when = "4 s ago";
        made.present = [me.id];
        log(`published ${name} / ${first.name}, v1`, `${name} / ${first.name}`, "synced", made.slug, first.name);
        touch();
      }, 1200);
      return made;
    },
    markReady: (assetSlug, partName) => {
      const { a, p } = findPart(assetSlug, partName);
      const blocking = p.checks.filter((c) => c.status === "fail" && c.blocks).length;
      if (blocking > 0) return { ok: false, reason: `${blocking} check${blocking > 1 ? "s" : ""} block${blocking > 1 ? "" : "s"}. Fix ${blocking > 1 ? "them" : "it"}, then mark Ready.` };
      p.state = "ready";
      if (a.parts.every((x) => x.state === "ready" || x.state === "approved")) a.state = "ready";
      log(`marked ${a.name} / ${p.name} Ready`, `${a.name} / ${p.name}`, "ready", assetSlug, partName);
      touch();
      return { ok: true };
    },
    fixChecks: (assetSlug, partName) => {
      const { p } = findPart(assetSlug, partName);
      for (const c of p.checks) if (c.fixable && c.status !== "pass") { c.status = "pass"; c.detail = c.fixedDetail ?? c.detail; c.blocks = false; }
      touch();
      return { ok: true };
    },
    rollBack: (assetSlug, partName, toVersion) => {
      const { p } = findPart(assetSlug, partName);
      const from = p.versions.find((v) => v.n === toVersion);
      if (!from) throw new Error(`no version v${toVersion}`);
      const top = p.versions[0]?.n ?? 0;
      const made: Version = { id: `${partName}-v${top + 1}`, n: top + 1, note: "current", render: from.render, authorId: me.id, when: "Just now", mirror: "synced", from: toVersion };
      p.versions = [made, ...p.versions.map((v) => ({ ...v, note: v.note === "current" ? "" : v.note }))];
      touch();
      return made;
    },
    removeGate: (assetSlug, partName) => {
      const { a, p } = findPart(assetSlug, partName);
      p.gate = [];
      if (p.state === "locked" || p.state === "waiting") p.state = "draft";
      log(`removed the gate on ${a.name} / ${p.name}`, `${a.name} / ${p.name}`, "draft", assetSlug, partName);
      touch();
    },
    addComment: (assetSlug, partName, text, pos) => {
      const { a, p } = findPart(assetSlug, partName);
      const n = Math.max(0, ...a.parts.flatMap((x) => x.comments.map((c) => c.n))) + 1;
      const c: Comment = { id: `c${nextComment++}`, n, authorId: me.id, partName, when: "Just now", text, resolved: false, kind: "pin", source: "Nkata", ...(pos ? { pos } : {}) };
      p.comments = [...p.comments, c];
      touch();
      return c;
    },
    invite: (email, role) => {
      const name = email.split("@")[0] ?? email;
      people = [...people, { id: `invite-${people.length}`, name: email, initial: name.charAt(0).toUpperCase(), tone: 2, title: "Invite sent", role, email: "Invite sent", presence: "offline", where: "", seen: "" }];
      emit();
    },
    setMemberRole: (personId, role) => { people = people.map((p) => (p.id === personId ? { ...p, role, title: role === "art_director" ? "Art director" : role.charAt(0).toUpperCase() + role.slice(1) } : p)); emit(); },
    removeMember: (personId) => { people = people.filter((p) => p.id !== personId); emit(); },
    connect: (id) => { connected = { ...connected, [id]: true }; emit(); },
    ask: (question): AskAnswer => {
      const q = question.toLowerCase();
      const ojukwu = assetList.find((a) => a.slug === "ojukwu");
      if (ojukwu && (q.includes("ojukwu") || q.includes("block"))) {
        return { answer: "Ojukwu is waiting on face. Ada owns it, Draft since Tuesday. The gate to textures opens when face is Approved.", note: 'Last comment, Emeka, 2 h ago: "Shadow under the table is crushed. Approve after fix."', link: { label: "Open Ojukwu / face", assetSlug: "ojukwu", partName: "face" } };
      }
      const ready = assetList.filter((a) => a.state === "ready");
      if (ready.length) return { answer: `${ready.length} asset${ready.length > 1 ? "s are" : " is"} Ready for review: ${ready.map((a) => a.name).join(", ")}.`, note: "Open the activity rail and press Review to see them.", link: { label: `Open ${ready[0]!.name}`, assetSlug: ready[0]!.slug } };
      return { answer: "Nothing is blocked. Save a part in Blender and ask again.", note: "", link: null };
    },
    setDigestIndex: () => undefined,
    setDigestHome: () => undefined,
    setTheme: (t) => { theme = t; emit(); },
  };
}
