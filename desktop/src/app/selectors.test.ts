// The selectors must reproduce what the prototype shows for each stage. The numbers here are the
// prototype's own (stage=studio shows Needs my eyes 9 and Approved 11 for the lead, Mentions 2
// for the artist), read from the v8 prototype with the Tweaks (docs/v8-shots/proto-words.json).
import { describe, expect, it } from "vitest";
import { ME, MockDataSource, RISING_SUN } from "@/data/mock";
import { applyFilter, cardOrder, factsWithDeltas, filterCounts, journey, modelOf, publishState, sectionsByGroup, stripLabel, trisDelta, canReview } from "./selectors";

async function load(stage: "studio" | "empty" | "joining" | "firstsave" | "firstcomment", role: "lead" | "artist" | "viewer") {
  const mock = new MockDataSource({ stage, role });
  const assets = await mock.listAssets(RISING_SUN.id);
  const members = await mock.listMembers(RISING_SUN.id);
  return { mock, assets, members, me: mock.me };
}

describe("stage=studio", () => {
  it("lead: 30 cards, Everything 30, Mine 0, Needs my eyes 9, Approved 11", async () => {
    const { assets, me } = await load("studio", "lead");
    expect(assets).toHaveLength(30);
    expect(assets.filter((a) => a.kind === "object")).toHaveLength(21);
    expect(filterCounts(assets, me).map((f) => [f.name, f.count])).toEqual([["Everything", 30], ["Mine", 0], ["Needs my eyes", 9], ["Approved", 11]]);
  });
  it("artist: Mine 5, Needs my eyes 2 (the two that mention Ada)", async () => {
    const { assets, me } = await load("studio", "artist");
    expect(filterCounts(assets, me).map((f) => [f.name, f.count])).toEqual([["Everything", 30], ["Mine", 5], ["Needs my eyes", 2], ["Approved", 11]]);
    expect(applyFilter(assets, me, "Needs my eyes", "All").map((a) => a.name)).toEqual(["Chair", "Soldier (blockout)"]);
  });
  it("viewer: no Mine chip", async () => {
    const { assets, me } = await load("studio", "viewer");
    expect(filterCounts(assets, me).map((f) => f.name)).toEqual(["Everything", "Needs my eyes", "Approved"]);
  });
  it("sections: Props 21 and Environments 9, titled; a saved card moves first", async () => {
    const { assets, me } = await load("studio", "lead");
    const shown = applyFilter(assets, me, "Everything", "All");
    expect(sectionsByGroup(assets, shown).map((s) => [s.name, s.assets.length, s.titled])).toEqual([["Props", 21, true], ["Environments", 9, true]]);
    const chair = assets.find((a) => a.name === "Chair")!;
    expect(cardOrder(assets, { [chair.id]: 1 })[0]!.name).toBe("Chair");
  });
  it("the team strip: You, then In Blender, Blender, Blender, Looking", async () => {
    const { members, me } = await load("studio", "lead");
    expect(members.map((m) => stripLabel(m, me))).toEqual(["You", "In Blender", "In Blender", "In Blender", "Blender", "Blender", "Blender", "Looking"]);
    expect(journey([], members, me, "studio").open).toBe(false);
  });
  it("the Radio card: v1 by Ada, live, first Version, four green checks; the Chair at v3 shows its delta", async () => {
    const { assets } = await load("studio", "artist");
    const radio = assets.find((a) => a.name === "Radio")!;
    expect(radio.live).toBeTruthy();
    expect(radio.versions[0]!.n).toBe(1);
    const rows = factsWithDeltas(radio.versions[0]!.facts, radio.versions[1]?.facts, radio.versions[0]!.checks);
    expect(rows.map((r) => [r.name, r.value, r.delta])).toEqual([["Triangles", "16,200", "first Version"], ["Textures", "2 named to the sheet", "new"], ["Scale", "1.00", "metres"], ["UV sets", "1", "same"]]);
    expect(publishState(radio, "")).toMatchObject({ can: false, label: "Publish, after the note" });
    expect(publishState(radio, "Dial glass added.")).toMatchObject({ can: true, label: "Publish v2" });
    const chair = assets.find((a) => a.name === "Chair")!;
    expect(chair.versions.map((v) => v.n)).toEqual([3, 2, 1]);
    expect(factsWithDeltas(chair.versions[0]!.facts, chair.versions[1]?.facts, chair.versions[0]!.checks)[0]).toMatchObject({ value: "48,000", delta: "+2k tris", tone: "neutral" });
  });
  it("the one failing card (index 12) blocks Publish until fixed", async () => {
    const { mock, assets } = await load("studio", "artist");
    const bad = assets[12]!;
    expect(bad.versions[0]!.checks.find((c) => c.key === "tris")).toMatchObject({ pass: false, sentence: "1,800 triangles. Budget is 50,000.", fix: "Over budget. Decimate or split the mesh." });
    expect(publishState(bad, "x").label).toBe("Publish, after the red one");
    await mock.fixCheck(bad.id, "tris");
    const fixed = (await mock.getAsset(bad.id))!;
    expect(publishState(fixed, "x").label).toBe(`Publish v${fixed.versions[0]!.n + 1}`);
  });
  it("a lead reviews a published Version, not Live and not an approved one", async () => {
    const { assets } = await load("studio", "lead");
    const waiting = assets.find((a) => a.name === "Market lantern")!;
    expect(canReview(waiting, waiting.versions[0]!.n)).toBe(true);
    expect(canReview(waiting, "live")).toBe(false);
    const approved = assets.find((a) => a.versions[0]!.approved)!;
    expect(canReview(approved, approved.versions[0]!.n)).toBe(false);
  });
});

describe("stage=empty", () => {
  it("lead: nothing on the wall, the journey open at 0 of 3, next action Invite your artists", async () => {
    const { assets, members, me } = await load("empty", "lead");
    expect(assets).toEqual([]);
    expect(members.map((m) => stripLabel(m, me))).toEqual(["You"]);
    expect(journey(assets, members, me, "empty")).toEqual({ steps: [false, false, false], done: 0, open: true, nextAction: "Invite your artists" });
  });
  it("lead: after one invite the strip shows Invited and the next action waits for them", async () => {
    const { mock, me } = await load("empty", "lead");
    await mock.invite(RISING_SUN.id, "ada@sunburst.studio", "artist");
    const members = await mock.listMembers(RISING_SUN.id);
    expect(members.map((m) => stripLabel(m, me))).toEqual(["You", "Invited"]);
    expect(journey([], members, me, "empty")).toMatchObject({ done: 1, nextAction: "Waiting for ada@sunburst.studio to join" });
  });
});

describe("stage=joining", () => {
  it("artist: three of the team's cards, Emeka as Lead, Ada as You, one journey step left", async () => {
    const { assets, members, me } = await load("joining", "artist");
    expect(assets.map((a) => [a.name, a.owner.first])).toEqual([["Radio", "Chidi"], ["Chair", "Ngozi"], ["Helmet", "Tobe"]]);
    expect(members.map((m) => stripLabel(m, me))).toEqual(["Lead", "You"]);
    expect(journey(assets, members, me, "joining")).toMatchObject({ done: 2, open: true, nextAction: "Open Blender and save" });
  });
});

describe("stage=firstsave", () => {
  it("artist: one live Market lantern at v1 with no note, first Version", async () => {
    const { assets, me } = await load("firstsave", "artist");
    expect(assets).toHaveLength(1);
    const a = assets[0]!;
    expect(a).toMatchObject({ name: "Market lantern", live: { savedAt: "Just now" }, owner: { first: "Ada" } });
    expect(a.versions[0]).toMatchObject({ n: 1, note: "" });
    expect(factsWithDeltas(a.versions[0]!.facts, undefined, a.versions[0]!.checks)[0]).toMatchObject({ delta: "first Version" });
    expect(filterCounts(assets, me).map((f) => f.count)).toEqual([1, 1, 0, 0]);
  });
  it("a simulated save on an empty project fills the Market lantern and lands as an event", async () => {
    const { mock } = await load("empty", "artist");
    const events: string[] = [];
    mock.subscribe((e) => events.push(e.type));
    const id = await mock.simulateSave();
    expect(id).toBe(`${RISING_SUN.id}/market-lantern`);
    expect(events).toEqual(["saved"]);
    expect((await mock.listAssets(RISING_SUN.id)).map((a) => a.name)).toEqual(["Market lantern"]);
  });
});

describe("deltas", () => {
  it("more triangles reads neutral, fewer reads good, none is first Version", () => {
    expect(trisDelta(16200, 14100)).toEqual({ text: "+2.1k tris", tone: "neutral" });
    expect(trisDelta(2100, 2400)).toEqual({ text: "−0.3k tris", tone: "good" });
    expect(trisDelta(22000, 22000)).toEqual({ text: "same", tone: "muted" });
    expect(trisDelta(1800, null)).toEqual({ text: "first Version", tone: "muted" });
  });
  it("me per role is the prototype's", () => {
    expect([ME.lead.first, ME.artist.first, ME.viewer.first]).toEqual(["Emeka", "Ada", "Funmi"]);
  });
});

describe("the stage per stop", () => {
  it("a picked Version loads its own model, an older one without a file falls back to the asset's, Live is the newest save", async () => {
    const { assets } = await load("studio", "lead");
    const base = assets.find((a) => a.versions.length > 1 && a.glb)!;
    const [newest, ...older] = base.versions;
    const asset = { ...base, versions: [{ ...newest!, glb: "/own.glb", render: "/own.png" }, ...older] };
    expect(modelOf(asset, newest!.n)).toEqual({ glb: "/own.glb", render: "/own.png" });
    expect(modelOf(asset, "live").glb).toBe("/own.glb");
    expect(modelOf(asset, older[0]!.n).glb).toBe(base.glb);
    expect(modelOf(base, newest!.n).glb).toBe(base.glb);
  });
});
