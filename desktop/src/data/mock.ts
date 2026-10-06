// Rising Sun by Sunburst, in memory. Content from the prototypes. One module behind DataSource.
import type { Role } from "@/auth/permissions";
import type { ActivityItem, Asset, Check, Comment, DataSource, Digest, Part, Person, RenderKey, Snapshot, Studio, Template, Version } from "./types";

const P = {
  ada: { id: "ada", name: "Ada Okafor", initial: "A", tone: 1, title: "Character artist", role: "artist", email: "ada@sunburst.studio", presence: "online", where: "In Ojukwu / face, Blender", seen: "now" },
  chidi: { id: "chidi", name: "Chidi Eze", initial: "C", tone: 2, title: "Character artist", role: "artist", email: "chidi@sunburst.studio", presence: "online", where: "In Ojukwu / cloth, Blender", seen: "now" },
  ngozi: { id: "ngozi", name: "Ngozi Obi", initial: "N", tone: 3, title: "Texture artist", role: "artist", email: "ngozi@sunburst.studio", presence: "online", where: "In Ojukwu / hair, Blender", seen: "now" },
  emeka: { id: "emeka", name: "Emeka Nwosu", initial: "E", tone: 4, title: "Art director", role: "art_director", email: "emeka@sunburst.studio", presence: "online", where: "Reviewing Compound / interior, UE5", seen: "now" },
  tobe: { id: "tobe", name: "Tobe Anyanwu", initial: "T", tone: 5, title: "Environment artist", role: "artist", email: "tobe@sunburst.studio", presence: "online", where: "In Enugu Market / stalls, UE5", seen: "now" },
  emmanuel: { id: "emmanuel", name: "Emmanuel Njoku", initial: "E", tone: 8, title: "Producer", role: "producer", email: "emmanuel@sunburst.studio", presence: "offline", where: "Last on the board", seen: "1 d" },
  funmi: { id: "funmi", name: "Funmi Adebayo", initial: "F", tone: 2, title: "Publisher", role: "viewer", email: "funmi@lagosinteractive.com", presence: "online", where: "Reading What changed", seen: "now" },
} satisfies Record<string, Person>;

const r = (key: RenderKey, pos = "center") => ({ key, pos });

function versions(part: string, top: number, notes: Record<number, string>, render: RenderKey, author: string): Version[] {
  const out: Version[] = [];
  for (let n = top; n >= top - 5; n--) {
    out.push({ id: `${part}-v${n}`, n, note: notes[n] ?? "", render: r(render, `${30 + (top - n) * 8}% 50%`), authorId: author, when: n === top ? "12 min" : n === top - 1 ? "1 h" : `${top - n} h`, mirror: notes[n] === "not mirrored" ? "failed" : "synced" });
  }
  return out;
}

const faceChecks: Check[] = [
  { id: "scale", name: "Scale", detail: "1.0", status: "pass", blocks: false, fixable: false },
  { id: "naming", name: "Naming", detail: "SM_Ojukwu_Face", status: "pass", blocks: false, fixable: false },
  { id: "rig", name: "Rig names", detail: "42 bones match the template", status: "pass", blocks: false, fixable: false },
  { id: "tris", name: "Triangle budget", detail: "48,200 of 30,000. Decimate or split the mesh.", status: "fail", blocks: true, fixable: true, fixedDetail: "28,410 of 30,000" },
  { id: "tex", name: "Texture size", detail: "3 textures over 2048. Fixed with the budget.", status: "warn", blocks: false, fixable: true, fixedDetail: "All 2048" },
  { id: "lods", name: "LODs", detail: "3 levels", status: "pass", blocks: false, fixable: false },
];

const passChecks = (names: [string, string][]): Check[] => names.map(([name, detail], i) => ({ id: `c${i}`, name, detail, status: "pass", blocks: false, fixable: false }));

const faceComments: Comment[] = [
  { id: "c1", n: 1, authorId: "emeka", partName: "face", when: "14 min", text: "Steam reads too strong in the key light.", resolved: false, source: "UE5", pin: { x: 58, y: 30 } },
  { id: "c2", n: 2, authorId: "emeka", partName: "face", when: "12 min", text: "Shadow under the table is crushed. Approve after fix.", resolved: false, source: "UE5", pin: { x: 30, y: 58 } },
];

const part = (name: string, state: Part["state"], ownerId: string, render: Part["render"], extra: Partial<Part> = {}): Part => ({
  id: `${name}`,
  name,
  state,
  ownerId,
  render,
  lock: null,
  gate: [],
  versions: [],
  checks: [],
  comments: [],
  mirror: { state: "synced", seconds: 4 },
  refs: [],
  ...extra,
});

function ojukwuParts(): Part[] {
  return [
    part("face", "draft", "ada", r("interior"), { lock: { holderId: "ada", since: "12 min" }, versions: versions("face", 14, { 14: "current", 12: "published", 11: "not mirrored", 9: "published" }, "interior", "ada"), checks: faceChecks.map((c) => ({ ...c })), comments: faceComments.map((c) => ({ ...c })) }),
    part("cloth", "locked", "chidi", r("courtyard", "60% 30%"), { lock: { holderId: "chidi", since: "4 min" }, versions: versions("cloth", 8, { 8: "current", 6: "published" }, "courtyard", "chidi"), checks: passChecks([["Scale", "1.0"], ["Naming", "SM_Ojukwu_Cloth"], ["Triangle budget", "18,900 of 20,000"]]), comments: [{ id: "c3", n: 3, authorId: "chidi", partName: "cloth", when: "Mon", text: "Collar matches the sheet now.", resolved: true, source: "Blender" }] }),
    part("hair", "ready", "ngozi", r("tree", "70% 20%"), { versions: versions("hair", 3, { 3: "current" }, "tree", "ngozi"), checks: passChecks([["Scale", "1.0"], ["Naming", "SM_Ojukwu_Hair"]]) }),
    part("textures", "waiting", "ngozi", null, { gate: ["face", "cloth", "hair"] }),
    part("rig", "waiting", "chidi", null, { gate: ["textures"] }),
    part("lookdev", "waiting", "ada", null, { gate: ["rig"] }),
  ];
}

function levelParts(names: [string, Part["state"], string][], render: RenderKey): Part[] {
  return names.map(([name, state, owner], i) => part(name, state, owner, state === "waiting" ? null : r(render, `${20 + i * 20}% 40%`), { versions: state === "waiting" ? [] : versions(name, 6 - i, { [6 - i]: "current" }, render, owner), checks: passChecks([["Scale", "1.0"], ["Naming", "ok"]]), gate: state === "waiting" ? [names[i - 1]?.[0] ?? ""] : [] }));
}

function assets(): Asset[] {
  return [
    { id: "ojukwu", slug: "ojukwu", name: "Ojukwu", kind: "Characters", state: "draft", render: r("ground", "60% 40%"), meta: "Character · changed 12 min ago", ownerId: "ada", present: ["ada", "chidi", "ngozi"], parts: ojukwuParts(), template: "Character", usedIn: ["Enugu Market"], changedOrder: 0 },
    { id: "compound-interior", slug: "compound-interior", name: "Compound / interior", kind: "Levels", state: "ready", render: r("interior"), meta: "Level · marked Ready 14 min ago", ownerId: "ada", present: ["ada"], parts: levelParts([["set dressing", "ready", "ada"], ["lighting", "approved", "emeka"], ["props", "draft", "tobe"]], "interior"), template: "Level area", usedIn: [], changedOrder: 1 },
    { id: "enugu-market", slug: "enugu-market", name: "Enugu Market", kind: "Levels", state: "ready", render: r("overview"), meta: "Level · changed 1 h ago", ownerId: "tobe", present: ["tobe", "emeka"], parts: levelParts([["square", "approved", "tobe"], ["stalls", "ready", "tobe"], ["lighting", "waiting", "emeka"]], "overview"), template: "Level area", usedIn: [], changedOrder: 2 },
    { id: "compound", slug: "compound", name: "Compound", kind: "Levels", state: "approved", render: r("courtyard"), meta: "Level · approved yesterday", ownerId: "tobe", present: [], parts: levelParts([["blockout", "approved", "tobe"], ["set dressing", "approved", "tobe"], ["lighting", "approved", "emeka"]], "courtyard"), template: "Level area", usedIn: [], changedOrder: 3 },
    { id: "clay-oven", slug: "clay-oven", name: "Clay oven", kind: "Props", state: "approved", render: r("tree", "20% 10%"), meta: "Prop · approved Monday", ownerId: "tobe", present: [], parts: levelParts([["model", "approved", "tobe"], ["textures", "approved", "ngozi"]], "tree"), template: "Environment prop", usedIn: ["Compound"], changedOrder: 5 },
    { id: "zinc-roof-house", slug: "zinc-roof-house", name: "Zinc roof house", kind: "Props", state: "locked", render: r("courtyard", "80% 20%"), meta: "Prop · Chidi has it", ownerId: "chidi", present: ["chidi"], parts: levelParts([["model", "locked", "chidi"], ["textures", "waiting", "ngozi"]], "courtyard"), template: "Environment prop", usedIn: ["Compound"], changedOrder: 6 },
    { id: "market-stall", slug: "market-stall", name: "Market stall", kind: "Props", state: "ready", render: r("overview", "30% 70%"), meta: "Prop · marked Ready 3 h ago", ownerId: "tobe", present: ["tobe"], parts: levelParts([["model", "ready", "tobe"], ["textures", "draft", "ngozi"]], "overview"), template: "Environment prop", usedIn: ["Enugu Market"], changedOrder: 7 },
    { id: "kettle", slug: "kettle", name: "Kettle", kind: "Props", state: "draft", render: null, noRenderText: "concept · model · uvs", meta: "Prop · changed 1 h ago", ownerId: "tobe", present: [], parts: [part("concept", "approved", "tobe", null, { versions: versions("concept", 2, { 2: "current" }, "tree", "tobe") }), part("model", "draft", "tobe", null, { versions: versions("model", 4, { 4: "current" }, "tree", "tobe") }), part("uvs", "waiting", "tobe", null, { gate: ["model"] })], template: "Environment prop", usedIn: [], changedOrder: 4 },
  ];
}

const ACTIVITY: ActivityItem[] = [
  { id: "a1", personId: "ada", text: "saved v14. In Unreal.", target: "Ojukwu / face", when: "12 min", dot: "synced", assetSlug: "ojukwu", partName: "face" },
  { id: "a2", personId: "ada", text: "marked Ready.", target: "Compound / interior", when: "14 min", dot: "ready", assetSlug: "compound-interior" },
  { id: "a3", personId: "emeka", text: "pinned 2 comments.", target: "Ojukwu / face", when: "14 min", dot: "muted", assetSlug: "ojukwu", partName: "face" },
  { id: "a4", personId: "ada", text: "hit the triangle budget.", target: "Ojukwu / face", when: "20 min", dot: "failed", assetSlug: "ojukwu", partName: "face" },
  { id: "a5", personId: "tobe", text: "published v22.", target: "Enugu Market / square", when: "1 h", dot: "approved", assetSlug: "enugu-market" },
  { id: "a6", personId: "tobe", text: "saved v4.", target: "Kettle / model", when: "1 h", dot: "synced", assetSlug: "kettle", partName: "model" },
  { id: "a7", personId: "emeka", text: "approved. Locked.", target: "Compound / lighting", when: "2 h", dot: "approved", assetSlug: "compound" },
  { id: "a8", personId: "chidi", text: "opened. Lock started.", target: "Zinc roof house / model", when: "2 h", dot: "locked", assetSlug: "zinc-roof-house" },
  { id: "a9", personId: "ngozi", text: "marked Ready.", target: "Ojukwu / hair", when: "1 d", dot: "ready", assetSlug: "ojukwu", partName: "hair" },
  { id: "a10", personId: "tobe", text: "marked Ready.", target: "Market stall / model", when: "3 h", dot: "ready", assetSlug: "market-stall" },
];

const TEMPLATES: Template[] = [
  { id: "character", name: "Character", usedBy: 4, tools: "Blender 4.2 · Unreal 5.4 · FBX, 3 LODs, 2048", parts: [
    { id: "t1", name: "face", gate: [], checks: ["Scale", "Naming", "Tris 30k", "Rig names"], refs: 3 },
    { id: "t2", name: "cloth", gate: [], checks: ["Scale", "Naming", "Tris 20k"], refs: 2 },
    { id: "t3", name: "hair", gate: [], checks: ["Scale", "Naming", "Tris 10k"], refs: 2 },
    { id: "t4", name: "textures", gate: ["face", "cloth", "hair"], checks: ["Size 2048", "Naming"], refs: 1 },
    { id: "t5", name: "rig", gate: ["textures"], checks: ["Rig names", "Scale"], refs: 0 },
    { id: "t6", name: "lookdev", gate: ["rig"], checks: ["LODs 3", "Collision"], refs: 1 },
  ] },
  { id: "prop", name: "Environment prop", usedBy: 4, tools: "Blender 4.2 · Unreal 5.4 · glTF, 3 LODs, 2048", parts: [
    { id: "p1", name: "concept", gate: [], checks: ["Size 2048"], refs: 2 }, { id: "p2", name: "model", gate: [], checks: ["Scale", "Naming", "Tris 15k", "Pivot at base"], refs: 2 }, { id: "p3", name: "uvs", gate: ["model"], checks: ["UV set", "Naming"], refs: 0 }, { id: "p4", name: "textures", gate: ["uvs"], checks: ["Size 2048", "Naming"], refs: 1 }, { id: "p5", name: "lods", gate: ["textures"], checks: ["LODs 3"], refs: 0 }, { id: "p6", name: "collision", gate: ["model"], checks: ["Collision"], refs: 0 },
  ] },
  { id: "level", name: "Level area", usedBy: 3, tools: "Unreal 5.4 · One File Per Actor", parts: [
    { id: "l1", name: "blockout", gate: [], checks: ["Scale"], refs: 2 }, { id: "l2", name: "layout", gate: ["blockout"], checks: ["Naming"], refs: 1 }, { id: "l3", name: "set dressing", gate: ["layout"], checks: ["Naming"], refs: 1 }, { id: "l4", name: "lighting", gate: ["set dressing"], checks: [], refs: 1 },
  ] },
];

const DIGESTS: Digest[] = [
  {
    weekLabel: "Week of 28 September", changed: 14, moved: 3, notes: 9, hasPrevious: true, hasNext: false,
    renderPairs: [
      { assetSlug: "ojukwu", name: "Ojukwu", note: "face v9 to v14 · Ada", before: r("courtyard"), after: r("ground"), beforeLabel: "Last week · v9", afterLabel: "This week · v14" },
      { assetSlug: "compound-interior", name: "Compound / interior", note: "v3 to v6 · Ada", before: r("tree"), after: r("interior"), beforeLabel: "Last week · v3", afterLabel: "This week · v6" },
    ],
    moves: [
      { assetSlug: "compound-interior", name: "Compound / interior", from: "draft", to: "ready", when: "Wed", render: r("interior") },
      { assetSlug: "compound", name: "Compound / lighting", from: "ready", to: "approved", when: "Tue", render: r("overview") },
      { assetSlug: "ojukwu", name: "Ojukwu / hair", from: "draft", to: "ready", when: "Mon", render: r("tree") },
      { assetSlug: "enugu-market", name: "Enugu Market / square", from: "ready", to: "approved", when: "Mon", render: r("courtyard") },
    ],
    weekNotes: [
      { personId: "emeka", on: "Ojukwu / face", when: "Thu", text: "Shadow under the table is crushed. Approve after fix." },
      { personId: "tobe", on: "Kettle / model", when: "Wed", text: "Spout reads too thin from the gate. Thicker in v4." },
      { personId: "chidi", on: "Ojukwu / cloth", when: "Tue", text: "Collar matches the sheet now." },
      { personId: "funmi", on: "Enugu Market", when: "Mon", text: "The market reads busy from the gate. Keep that." },
    ],
  },
  {
    weekLabel: "Week of 21 September", changed: 9, moved: 2, notes: 4, hasPrevious: false, hasNext: true,
    renderPairs: [{ assetSlug: "enugu-market", name: "Enugu Market", note: "square v18 to v22 · Tobe", before: r("overview", "20% 50%"), after: r("overview"), beforeLabel: "Two weeks ago · v18", afterLabel: "Last week · v22" }],
    moves: [
      { assetSlug: "clay-oven", name: "Clay oven / model", from: "ready", to: "approved", when: "Mon", render: r("tree") },
      { assetSlug: "compound", name: "Compound / blockout", from: "ready", to: "approved", when: "Thu", render: r("courtyard") },
    ],
    weekNotes: [
      { personId: "emeka", on: "Compound / lighting", when: "Fri", text: "Dusk pass reads right. Keep the warm key." },
      { personId: "tobe", on: "Enugu Market / stalls", when: "Wed", text: "Stall roofs need the zinc material from the house." },
    ],
  },
];

const STUDIO: Studio = {
  id: "sunburst", name: "Sunburst", initial: "S", peopleCount: 7,
  projects: [
    { id: "rising-sun", slug: "rising-sun", name: "Rising Sun", assetCount: 8, changed: "changed 12 min ago", renders: ["ground", "overview", "interior"], present: ["ada", "chidi", "ngozi", "emeka"], folder: "~/Projects/Rising Sun", blender: "4.2.3 LTS", unreal: "5.4.4", inviteLink: "nkata.app/join/rising-sun-7f3a", sizeLabel: "3.4 GB" },
    { id: "greybox", slug: "greybox-tests", name: "Greybox tests", assetCount: 3, changed: "changed Tuesday", renders: ["courtyard"], present: [], folder: "~/Projects/Greybox", blender: "4.2.3 LTS", unreal: "5.4.4", inviteLink: "nkata.app/join/greybox-2c1d", sizeLabel: "420 MB" },
  ],
};

export function createMockSource(initialRole: "artist" | "viewer" = "artist"): DataSource {
  const listeners = new Set<() => void>();
  let people: Person[] = Object.values(P).map((p) => ({ ...p }));
  let assetList = assets();
  let activity = [...ACTIVITY];
  let digestIndex = 0;
  let session: Snapshot["session"] = { user: people.find((p) => p.id === (initialRole === "viewer" ? "funmi" : "ada"))!, studio: STUDIO, theme: "dark", digestHome: true };
  let nextComment = 10;

  const emit = () => listeners.forEach((fn) => fn());
  const findPart = (assetSlug: string, partName: string) => {
    const a = assetList.find((x) => x.slug === assetSlug);
    const p = a?.parts.find((x) => x.name === partName);
    if (!a || !p) throw new Error(`no part ${assetSlug}/${partName}`);
    return { a, p };
  };
  const touch = () => {
    assetList = [...assetList];
    emit();
  };

  return {
    snapshot: () => ({ session, people, assets: assetList, activity, templates: TEMPLATES, digests: DIGESTS, digestIndex, online: people.filter((p) => p.presence === "online" && p.role !== "viewer").length, changedToday: 14, changedThisWeek: 14 }),
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    signIn: (as) => { session = { ...session, user: people.find((p) => p.id === (as === "viewer" ? "funmi" : "ada"))! }; emit(); },
    signOut: () => emit(),
    markReady: (assetSlug, partName) => {
      const { a, p } = findPart(assetSlug, partName);
      const blocking = p.checks.filter((c) => c.status === "fail" && c.blocks).length;
      if (blocking > 0) return { ok: false, reason: `${blocking} check${blocking > 1 ? "s" : ""} block${blocking > 1 ? "" : "s"}. Fix ${blocking > 1 ? "them" : "it"}, then mark Ready.` };
      p.state = "ready";
      p.lock = null;
      p.mirror = { state: "syncing", seconds: 2 };
      if (a.parts.every((x) => x.state === "ready" || x.state === "approved" || x.state === "waiting")) a.state = "ready";
      activity = [{ id: `act-${Date.now()}`, personId: session.user.id, text: "marked Ready.", target: `${a.name} / ${p.name}`, when: "now", dot: "ready", assetSlug, partName }, ...activity];
      setTimeout(() => { p.mirror = { state: "synced", seconds: 4 }; touch(); }, 1800);
      touch();
      return { ok: true };
    },
    fixChecks: (assetSlug, partName) => {
      const { p } = findPart(assetSlug, partName);
      for (const c of p.checks) if (c.fixable && c.status !== "pass") { c.status = "pass"; c.detail = c.fixedDetail ?? c.detail; c.blocks = false; }
      p.mirror = { state: "syncing", seconds: 2 };
      setTimeout(() => { p.mirror = { state: "synced", seconds: 4 }; touch(); }, 1800);
      touch();
      return { ok: true };
    },
    rollBack: (assetSlug, partName, toVersion) => {
      const { p } = findPart(assetSlug, partName);
      const from = p.versions.find((v) => v.n === toVersion);
      if (!from) throw new Error(`no version v${toVersion}`);
      const top = p.versions[0]?.n ?? 0;
      const made: Version = { id: `${partName}-v${top + 1}`, n: top + 1, note: "current", render: from.render, authorId: session.user.id, when: "now", mirror: "synced", from: toVersion };
      p.versions = [made, ...p.versions.map((v) => ({ ...v, note: v.note === "current" ? "" : v.note }))];
      p.mirror = { state: "syncing", seconds: 2 };
      setTimeout(() => { p.mirror = { state: "synced", seconds: 4 }; touch(); }, 1800);
      touch();
      return made;
    },
    removeGate: (assetSlug, partName) => {
      const { a, p } = findPart(assetSlug, partName);
      p.gate = [];
      if (p.state === "waiting") p.state = "draft";
      if (!p.versions.length) p.versions = [{ id: `${partName}-v0`, n: 0, note: "gate removed", render: a.render ?? r("ground"), authorId: p.ownerId, when: "now", mirror: "synced" }];
      activity = [{ id: `act-${Date.now()}`, personId: session.user.id, text: `removed the gate on ${p.name}.`, target: `${a.name} / ${p.name}`, when: "now", dot: "draft", assetSlug, partName }, ...activity];
      touch();
    },
    addComment: (assetSlug, partName, text) => {
      const { a, p } = findPart(assetSlug, partName);
      const n = Math.max(0, ...a.parts.flatMap((x) => x.comments.map((c) => c.n))) + 1;
      const c: Comment = { id: `c${nextComment++}`, n, authorId: session.user.id, partName, when: "now", text, resolved: false, source: "Nkata" };
      p.comments = [...p.comments, c];
      touch();
      return c;
    },
    invite: (email: string, role: Role) => {
      activity = [{ id: `act-${Date.now()}`, personId: session.user.id, text: `invited ${email} as ${role === "art_director" ? "an art director" : role === "artist" ? "an artist" : `a ${role}`}.`, target: "Rising Sun", when: "now", dot: "muted", assetSlug: "" }, ...activity];
      emit();
    },
    setDigestIndex: (i) => { digestIndex = Math.max(0, Math.min(DIGESTS.length - 1, i)); emit(); },
    setDigestHome: (on) => { session = { ...session, digestHome: on }; emit(); },
    setTheme: (theme) => { session = { ...session, theme }; emit(); },
  };
}
