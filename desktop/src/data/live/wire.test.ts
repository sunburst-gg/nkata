// The mapping from the server's wire onto the v8 nouns, without a server.
import { describe, expect, it } from "vitest";
import { DEFAULT_BUDGETS } from "../types";
import type { Comment } from "../types";
import type { Template } from "@nkata/shared";
import { rulesOf, withRules } from "./wire";
import { ago, assetOf, budgetFor, budgetsOf, budgetsWire, checksOf, colorOf, commentOf, factsOf, journeyOf, mentionsOf, namesMe, personOf, roleOf, versionOf, type AssetWire, type MemberWire, type PartWire, type VersionWire } from "./wire";

const NOW = new Date("2026-10-18T12:00:00Z");
const ada = { id: "01ADA000000000000000000000", name: "Ada Okafor", avatar_url: null };
const emeka = { id: "01EMEKA00000000000000000000", name: "Emeka Nnamdi", avatar_url: null };
const part: PartWire = { id: "p1", asset_id: "a1", name: "model", owner: ada, owner_id: ada.id, state: "draft", mapping: { kind: "blend_collection", file: "Radio/Radio.blend" }, updated_at: "2026-10-18T11:00:00Z", lock: null };
const wire: AssetWire = { id: "a1", name: "Radio", template_id: "t", state: "draft", updated_at: "2026-10-18T11:00:00Z", kind: "object", group: "Props" };
const manifest = { objects: [{ name: "Body", triangles: 12_000, materials: ["M_Radio"], hash: "x", uv_sets: ["UVMap"] }, { name: "Dial", triangles: 4_200, materials: ["M_Radio"], hash: "y", uv_sets: ["UVMap"] }], textures: [{ name: "T_Radio_BC", width: 2048, height: 2048 }], unit_scale: 1 };
const v = (id: string, at: string, published: boolean, note = ""): VersionWire => ({ id, part_id: "p1", author_id: ada.id, published, note, created_at: at, manifest, render_url: `https://x/${id}.png`, model_url: `https://x/${id}.glb` });
const people = new Map([[ada.id, personOf(ada, ["artist"], "ada@sunburst.studio")], [emeka.id, personOf(emeka, ["producer"])]]);

describe("people and time", () => {
  it("maps the strongest role, a stable color and the first name", () => {
    expect(roleOf(["artist", "art_director"])).toBe("artDirector");
    expect(roleOf(["viewer"])).toBe("viewer");
    expect(roleOf([])).toBe("viewer");
    const p = personOf(ada, ["artist"], "ada@sunburst.studio");
    expect(p).toMatchObject({ first: "Ada", initial: "A", role: "artist", email: "ada@sunburst.studio" });
    expect(p.color).toBe(colorOf(ada.id));
    expect(p.color).toMatch(/^var\(--p-/);
    expect(personOf({ id: "01NEW", name: "", avatar_url: null }, ["artist"], "new@studio.com")).toMatchObject({ first: "new", initial: "N" });
  });
  it("says when in the product's words", () => {
    expect(ago("2026-10-18T11:59:30Z", NOW)).toBe("Just now");
    expect(ago("2026-10-18T11:48:00Z", NOW)).toBe("12 min ago");
    expect(ago("2026-10-18T09:00:00Z", NOW)).toBe("3 h ago");
    expect(ago("2026-10-17T09:00:00Z", NOW)).toBe("Yesterday");
    expect(ago("2026-10-14T09:00:00Z", NOW)).toBe("4 days ago");
    expect(ago("2026-10-02T09:00:00Z", NOW)).toBe("2 Oct");
  });
});

describe("the save in Unreal", () => {
  it("a version carries its mirror status, and a skipped one carries none", () => {
    const base = { id: "v", part_id: "p", author_id: "a", published: false, note: "", created_at: "2026-10-18T11:30:00Z" };
    expect(versionOf({ v: { ...base, mirror_status: "synced" }, checks: [], reviews: [], partApproved: false }, 1, 30_000, new Date("2026-10-18T12:00:00Z")).unreal).toBe("synced");
    expect(versionOf({ v: { ...base, mirror_status: "skipped" }, checks: [], reviews: [], partApproved: false }, 1, 30_000, new Date("2026-10-18T12:00:00Z")).unreal).toBeUndefined();
  });
});

describe("the export the add-on read back (v8 step 17)", () => {
  it("carries the rig, the animations and the export in the add-on's own words", () => {
    const facts = factsOf({ ...manifest, bones: ["root", "hand_L"], animations: [{ name: "Walk", seconds: 1.25 }], export: { intact: false, losses: [{ kind: "animation", names: ["Idle"], sentence: "Animations not in the export: Idle." }], bones_changed: ["hand_R"] } })!;
    expect(facts.bones).toBe(2);
    expect(facts.animations).toEqual([{ name: "Walk", seconds: 1.25 }]);
    expect(facts.export).toEqual({ intact: false, lines: ["Animations not in the export: Idle.", "Bones gone since the last save: hand_R."] });
    expect(factsOf({ ...manifest, export: { intact: true, losses: [] } })!.export).toEqual({ intact: true, lines: ["Export intact."] });
  });
});

describe("facts, checks and budgets", () => {
  it("sums triangles from the manifest; the other checks are pending until the add-on reports", () => {
    const facts = factsOf(manifest)!;
    expect(facts).toEqual({ tris: 16_200, textures: 1, scale: "1.00", uvSets: 1 });
    const checks = checksOf(facts, [], 30_000);
    expect(checks.map((c) => c.key)).toEqual(["textures", "scale", "uv", "tris"]);
    expect(checks.filter((c) => c.pending)).toHaveLength(3);
    expect(checks.find((c) => c.key === "tris")).toMatchObject({ pass: true, sentence: "16,200 triangles, within budget." });
    expect(checksOf(facts, [], 15_000).find((c) => c.key === "tris")).toMatchObject({ pass: false, sentence: "16,200 triangles. Budget is 15,000." });
    const reported = checksOf(facts, [{ check_id: "unit_scale", severity: "block", passed: false, auto_fixed: false, message: "Scale is 0.01." }, { check_id: "uv_set_present", severity: "block", passed: true, auto_fixed: false, message: "" }], 30_000);
    expect(reported.find((c) => c.key === "scale")).toMatchObject({ pass: false, sentence: "Scale is 0.01." });
    expect(reported.find((c) => c.key === "uv")).toMatchObject({ pass: true, sentence: "UVs present." });
    expect(checksOf(null, [], 30_000).every((c) => c.pending)).toBe(true);
    // The add-on's four lines win, and the triangle line re-reads the project budget.
    const fromAddon = checksOf(facts, [], 15_000, [
      { key: "textures", pass: true, sentence: "Textures named · 1", fix: "x" }, { key: "scale", pass: false, sentence: "Scale is 0.01.", fix: "Apply scale in Blender. Fix does it." },
      { key: "uv", pass: true, sentence: "UVs present · 1 set", fix: "y" }, { key: "tris", pass: true, sentence: "16,200 triangles, within budget of 30,000", fix: "z" },
    ]);
    expect(fromAddon.map((c) => [c.key, c.pass])).toEqual([["textures", true], ["scale", false], ["uv", true], ["tris", false]]);
    expect(fromAddon[1]!.sentence).toBe("Scale is 0.01.");
    expect(fromAddon[3]!.sentence).toBe("16,200 triangles. Budget is 15,000.");
  });
  it("budgets map both ways and the override wins", () => {
    expect(budgetsOf(undefined)).toEqual(DEFAULT_BUDGETS);
    expect(budgetsOf({ prop: 1, vehicle: 2, character: 3, environment: 4, max_texture: 2048 })).toEqual({ prop: 1, vehicle: 2, character: 3, environment: 4, maxTexture: 2048 });
    // v8 step 18: the Nanite threshold rides with the budgets, both ways, absent when unset.
    expect(budgetsOf({ prop: 1, vehicle: 2, character: 3, environment: 4, max_texture: null, nanite_triangle_threshold: 250_000 })).toMatchObject({ nanite: 250_000 });
    expect(budgetsWire({ prop: 1, vehicle: 2, character: 3, environment: 4, maxTexture: null, nanite: 250_000 })).toMatchObject({ nanite_triangle_threshold: 250_000 });
    expect(budgetsWire({ prop: 1, vehicle: 2, character: 3, environment: 4, maxTexture: null })).not.toHaveProperty("nanite_triangle_threshold");
    expect(budgetFor(DEFAULT_BUDGETS, "object", "Vehicles")).toBe(60_000);
    expect(budgetFor(DEFAULT_BUDGETS, "object", "Characters")).toBe(80_000);
    expect(budgetFor(DEFAULT_BUDGETS, "environment", null)).toBe(2_000_000);
    expect(budgetFor(DEFAULT_BUDGETS, "object", "Props", 45_000)).toBe(45_000);
  });
});

describe("assets", () => {
  it("numbers published Versions from v1 and keeps an unpublished newest save as Live", () => {
    const versions = [
      { v: v("v1", "2026-10-10T10:00:00Z", true, "First pass."), checks: [], reviews: [], partApproved: false },
      { v: v("v2", "2026-10-12T10:00:00Z", true, "Dial added."), checks: [], reviews: [{ id: "r", part_id: "p1", version_id: "v2", reviewer_id: emeka.id, decision: "approve" as const, note: "", created_at: "2026-10-12T11:00:00Z" }], partApproved: false },
      { v: v("v3", "2026-10-18T11:30:00Z", false), checks: [], reviews: [], partApproved: false },
    ];
    const a = assetOf({ a: wire, part, versions, people, online: [], budgets: DEFAULT_BUDGETS, now: NOW, mentionsMe: false });
    expect(a).toMatchObject({ id: "a1", name: "Radio", kind: "object", group: "Props", changedAt: "30 min ago", today: true, glb: "https://x/v3.glb", render: "https://x/v3.png" });
    expect(a.owner.first).toBe("Ada");
    expect(a.live).toEqual({ savedAt: "30 min ago" });
    expect(a.versions.map((x) => [x.n, x.note, x.approved])).toEqual([[3, "", false], [2, "Dial added.", true], [1, "First pass.", false]]);
    expect(a.versions[1]!.facts?.tris).toBe(16_200);
  });
  it("a published part with a send back reads changes requested; a fresh heartbeat reads live", () => {
    const versions = [{ v: v("v1", "2026-10-10T10:00:00Z", true, "First pass."), checks: [], reviews: [{ id: "r", part_id: "p1", version_id: "v1", reviewer_id: emeka.id, decision: "send_back" as const, note: "Loosen the ridge.", created_at: "2026-10-11T10:00:00Z" }], partApproved: false }];
    const quiet = assetOf({ a: wire, part, versions, people, online: [], budgets: DEFAULT_BUDGETS, now: NOW, mentionsMe: true });
    expect(quiet.live).toBeUndefined();
    expect(quiet.mentionsMe).toBe(true);
    expect(quiet.versions[0]).toMatchObject({ n: 1, approved: false, changesRequested: true });
    const beating = assetOf({ a: wire, part, versions, people, online: [{ user: ada, part_id: "p1", since: "2026-10-18T11:00:00Z", last_seen: "2026-10-18T11:59:50Z" }], budgets: DEFAULT_BUDGETS, now: NOW, mentionsMe: false });
    expect(beating.live).toBeDefined();
    const stale = assetOf({ a: wire, part, versions, people, online: [{ user: ada, part_id: "p1", since: "2026-10-18T11:00:00Z", last_seen: "2026-10-18T11:50:00Z" }], budgets: DEFAULT_BUDGETS, now: NOW, mentionsMe: false });
    expect(stale.live).toBeUndefined();
  });
  it("an approved part with no review row still reads approved; the asset override sets the budget", () => {
    const versions = [{ v: v("v1", "2026-10-10T10:00:00Z", true, "Done."), checks: [], reviews: [], partApproved: true }];
    const a = assetOf({ a: { ...wire, budget: 15_000 }, part: { ...part, state: "approved" }, versions, people, online: [], budgets: DEFAULT_BUDGETS, now: NOW, mentionsMe: false });
    expect(a.versions[0]!.approved).toBe(true);
    expect(a.budget).toBe(15_000);
    expect(a.versions[0]!.checks.find((c) => c.key === "tris")).toMatchObject({ pass: false, sentence: "16,200 triangles. Budget is 15,000." });
    expect(versionOf(versions[0]!, 1, 30_000, NOW).publishedAt).toBe("10 Oct");
    expect(a.versions[0]).toMatchObject({ glb: "https://x/v1.glb", render: "https://x/v1.png" });
  });
  it("pins on the current Version are counted, open and total; an older Version's pins are not", () => {
    const versions = [{ v: v("v1", "2026-10-10T10:00:00Z", true, "Done."), checks: [], reviews: [], partApproved: false }, { v: v("v0", "2026-10-09T10:00:00Z", true, "First."), checks: [], reviews: [], partApproved: false }];
    const c = (id: string, version: number, done: boolean, pin = true): Comment => ({ id, assetId: wire.id, version, author: personOf(ada, ["artist"]), text: "x", at: "now", ...(pin ? { pin: [0, 0, 1] as [number, number, number] } : {}), ...(done ? { done } : {}) });
    const comments = [c("a", 2, false), c("b", 2, true), c("c", 2, false, false), c("d", 1, false)];
    expect(assetOf({ a: wire, part, versions, people, online: [], budgets: DEFAULT_BUDGETS, now: NOW, mentionsMe: false, comments }).pins).toEqual({ open: 1, total: 2 });
    expect(assetOf({ a: wire, part, versions, people, online: [], budgets: DEFAULT_BUDGETS, now: NOW, mentionsMe: false, comments: [c("d", 1, false)] }).pins).toBeUndefined();
    // v1 was sent back with d open: it carries onto v2 and names where it came from. Done, it stops.
    const sentBack = [{ ...versions[0]!, reviews: [] }, { ...versions[1]!, reviews: [{ id: "r1", part_id: "p1", version_id: "v0", reviewer_id: ada.id, decision: "send_back" as const, score: 3, note: "", created_at: "2026-10-09T12:00:00Z" }] }];
    expect(assetOf({ a: wire, part, versions: sentBack, people, online: [], budgets: DEFAULT_BUDGETS, now: NOW, mentionsMe: false, comments: [c("a", 2, false), c("d", 1, false)] }).pins).toEqual({ open: 2, total: 2, from: 1 });
    expect(assetOf({ a: wire, part, versions: sentBack, people, online: [], budgets: DEFAULT_BUDGETS, now: NOW, mentionsMe: false, comments: [c("d", 1, true)] }).pins).toBeUndefined();
  });
  it("a resolved comment reads done; an open one has no flag", () => {
    const base = { id: "c1", part_id: "p1", version_id: "v1", author: ada, body: "Soften the jaw", kind: "pin" as const, point: [0.2, 0.1, 0.4], created_at: "2026-10-10T10:00:00Z" };
    expect(commentOf({ ...base, resolved_at: "2026-10-10T11:00:00Z" }, "a1", 1, people, NOW).done).toBe(true);
    expect(commentOf({ ...base, resolved_at: null }, "a1", 1, people, NOW).done).toBeUndefined();
  });
});

describe("members and mentions", () => {
  const m: MemberWire = { user: ada, email: "ada@sunburst.studio", roles: ["artist"] };
  it("walks invited, joined, blender, in Blender", () => {
    expect(journeyOf({ ...m, user: { ...ada, name: "" } }, [], new Set(), NOW)).toBe("invited");
    expect(journeyOf(m, [], new Set(), NOW)).toBe("joined");
    expect(journeyOf(m, [], new Set([ada.id]), NOW)).toBe("blender");
    expect(journeyOf(m, [{ user: ada, part_id: null, since: "2026-10-18T11:00:00Z", last_seen: "2026-10-18T11:59:00Z" }], new Set(), NOW)).toBe("blender");
    expect(journeyOf(m, [{ user: ada, part_id: "p1", since: "2026-10-18T11:00:00Z", last_seen: "2026-10-18T11:59:30Z" }], new Set(), NOW)).toBe("inBlender");
    expect(journeyOf(m, [{ user: ada, part_id: "p1", since: "2026-10-18T11:00:00Z", last_seen: "2026-10-18T11:50:00Z" }], new Set(), NOW)).toBe("blender");
  });
  it("mentions: comments that name me, and for a lead the Versions waiting on them", () => {
    const me = people.get(emeka.id)!;
    expect(namesMe("Emeka, the roof reads stiff.", me)).toBe(true);
    expect(namesMe("emeka's call", me)).toBe(true);
    expect(namesMe("Emekaro", me)).toBe(false);
    const waiting = assetOf({ a: wire, part, versions: [{ v: v("v1", "2026-10-10T10:00:00Z", true, "First pass."), checks: [], reviews: [], partApproved: false }], people, online: [], budgets: DEFAULT_BUDGETS, now: NOW, mentionsMe: false });
    const comments = [{ id: "c1", assetId: "a1", version: 1, author: people.get(ada.id)!, text: "Emeka, is the dial right?", at: "1 h ago" }, { id: "c2", assetId: "a1", version: 1, author: me, text: "Emeka wrote this himself.", at: "1 h ago" }];
    const out = mentionsOf([waiting], comments, me);
    expect(out.map((x) => x.verb)).toEqual(["pinned on", "published, for you to approve"]);
    expect(out[0]).toMatchObject({ who: { first: "Ada" }, text: "Emeka, is the dial right?" });
    expect(out[1]).toMatchObject({ text: "First pass.", who: { first: "Ada" } });
    expect(mentionsOf([waiting], comments, people.get(ada.id)!)).toEqual([]);
  });
});

// v8 step 21: the rules per kind live in the project's templates, written and read back whole.
describe("rules", () => {
  const OBJECT: Template = {
    v: 1, name: "Object", kind: "prop", reference_slots: [], blend_layout: "one_file_per_asset", export: { ue_path: "/Game/Objects/{asset}", name: "SM_{asset}" },
    parts: [{ name: "model", mapping: "blend_collection", gate: [], checks: ["texture_names", "unit_scale", "uv_set_present", "triangle_budget", "pivot_at_base"], params: { texture_names: { pattern: "T_.*" }, pivot_at_base: { convention: "base" } }, severity: { pivot_at_base: "note" } }],
  };

  it("reads the Object template as it ships: four checks that hold Publish and the pivot at the base as a note", () => {
    expect(rulesOf(OBJECT)).toEqual([
      { key: "textures", level: "block" }, { key: "scale", level: "block" }, { key: "uv", level: "block" }, { key: "tris", level: "block" },
      { key: "pivot", level: "note", pivot: "base" },
    ]);
    const older = { ...OBJECT, parts: [{ ...OBJECT.parts[0]!, checks: OBJECT.parts[0]!.checks.slice(0, 4), severity: {} }] };
    expect(rulesOf(older).at(-1)).toMatchObject({ key: "pivot", level: "off" });
  });

  it("writes a level, a grid, and a pivot left out, and keeps every other param", () => {
    const rules = rulesOf(OBJECT).map((r) => (r.key === "pivot" ? { ...r, level: "block" as const, pivot: "grid" as const, gridM: 2 } : r.key === "uv" ? { ...r, level: "warn" as const } : r));
    const next = withRules(OBJECT, rules).parts[0]!;
    expect(next.severity).toMatchObject({ pivot_at_base: "block", uv_set_present: "warn", texture_names: "block" });
    expect(next.params).toEqual({ texture_names: { pattern: "T_.*" }, pivot_at_base: { convention: "grid", grid_m: 2 } });
    expect(rulesOf(withRules(OBJECT, rules))).toEqual(rules);
    const off = withRules(OBJECT, rulesOf(OBJECT).map((r) => (r.key === "pivot" ? { ...r, level: "off" as const } : r))).parts[0]!;
    expect(off.checks).not.toContain("pivot_at_base");
    expect(off.params).toEqual({ texture_names: { pattern: "T_.*" } });
  });
});
