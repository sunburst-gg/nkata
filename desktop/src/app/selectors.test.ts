// The selectors must reproduce what the prototype shows for each stage. The numbers here are the
// prototype's own (stage=studio shows Needs my eyes 9 and Approved 11 for the lead, Mentions 2
// for the artist), read from the v8 prototype with the Tweaks (docs/v8-shots/proto-words.json).
import { describe, expect, it } from "vitest";
import { ME, MockDataSource, RISING_SUN } from "@/data/mock";
import { needsMe, waitingOnLead } from "@/data/rules";
import { unrealRow } from "./selectors";
import { applyFilter, canPublishHere, canResolve, cardOrder, carried, openPinsLine, openPinsUpTo, factsWithDeltas, filterCounts, journey, modelOf, publishState, sectionsByGroup, stripLabel, trisDelta, canReview } from "./selectors";

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
    expect(rows.map((r) => [r.name, r.value, r.delta])).toEqual([["Triangles", "16,200", "first Version"], ["Textures", "2 named to the sheet", "new"], ["Scale", "1.00", "metres"], ["UV sets", "1", "new"]]);
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

describe("done on a pin", () => {
  it("the author, the owner and a lead may mark a pin done; a viewer who did not write it may not; a plain comment has no pin to mark", async () => {
    const { assets } = await load("studio", "lead");
    const asset = assets.find((a) => a.owner.id === ME.artist.id)!;
    const pin = { id: "c", assetId: asset.id, version: 1 as const, author: ME.viewer, text: "x", pin: [0, 0, 0] as [number, number, number], at: "now" };
    expect(canResolve(asset, pin, ME.viewer)).toBe(true);
    expect(canResolve(asset, pin, ME.artist)).toBe(true);
    expect(canResolve(asset, pin, ME.lead)).toBe(true);
    expect(canResolve(asset, { ...pin, author: ME.lead }, ME.viewer)).toBe(false);
    expect(canResolve(asset, { ...pin, pin: undefined }, ME.lead)).toBe(false);
  });
});

describe("open pins on a sent back Version", () => {
  it("the line reads the count, goes quiet once every pin is done, and puts the artist's own asset in their Needs my eyes", async () => {
    const { assets } = await load("studio", "artist");
    const base = assets.find((a) => a.owner.id === ME.artist.id && !a.live)!;
    const [v, ...rest] = base.versions;
    const sentBack = { ...base, versions: [{ ...v!, changesRequested: true, approved: false }, ...rest], pins: { open: 2, total: 3 } };
    expect(openPinsLine(sentBack)).toBe("2 of 3 pins open");
    expect(openPinsLine({ ...sentBack, pins: { open: 0, total: 3 } })).toBeNull();
    expect(openPinsLine({ ...sentBack, pins: { open: 1, total: 1 } })).toBe("1 of 1 pin open");
    expect(openPinsLine({ ...base, pins: { open: 2, total: 3 } })).toBeNull();
    expect(openPinsLine({ ...base, pins: { open: 2, total: 2, from: 1 } })).toBe("2 pins from v1 open");
    expect(openPinsLine({ ...base, pins: { open: 1, total: 3, from: 1 } })).toBe("1 pin from v1 open");
    expect(carried({ id: "c", assetId: base.id, version: 1, author: ME.lead, text: "x", at: "now", pin: [0, 0, 0] }, 2)).toBe(true);
    expect(carried({ id: "c", assetId: base.id, version: 2, author: ME.lead, text: "x", at: "now", pin: [0, 0, 0] }, 2)).toBe(false);
    expect(carried({ id: "c", assetId: base.id, version: "live", author: ME.lead, text: "x", at: "now", pin: [0, 0, 0] }, 2)).toBe(false);
    expect(needsMe([sentBack], ME.artist).map((a) => a.id)).toEqual([sentBack.id]);
    expect(needsMe([{ ...sentBack, pins: { open: 0, total: 3 } }], ME.artist)).toEqual([]);
    expect(needsMe([{ ...sentBack, owner: ME.lead }], ME.artist)).toEqual([]);
    // A director who owns the asset hears their own send back like an artist does.
    expect(needsMe([{ ...sentBack, owner: ME.artDirector }], ME.artDirector).map((a) => a.id)).toEqual([sentBack.id]);
  });
});

describe("the lead's second look", () => {
  it("approving a Version waives the open pins on it and before it, not later or done ones; a Version published after a send back waits on the lead again", async () => {
    const { assets } = await load("studio", "lead");
    const base = assets.find((a) => a.owner.id === ME.artist.id && !a.live && a.versions.length > 1)!;
    const pin = (id: string, version: number | "live", done = false) => ({ id, assetId: base.id, version, author: ME.lead, text: "x", at: "now", pin: [0, 0, 0] as [number, number, number], ...(done ? { done } : {}) });
    const comments = [pin("a", 1), pin("b", 2), pin("c", 2, true), pin("d", 3), pin("e", "live"), { ...pin("f", 2), pin: undefined }];
    expect(openPinsUpTo(comments, 2).map((c) => c.id)).toEqual(["a", "b"]);
    expect(openPinsUpTo(comments, 1).map((c) => c.id)).toEqual(["a"]);
    const [v2, v1, ...rest] = base.versions;
    const afterSendBack = { ...base, versions: [{ ...v2!, note: "Jaw softened.", approved: false, changesRequested: false }, { ...v1!, changesRequested: true, approved: false }, ...rest], pins: { open: 1, total: 1, from: v1!.n } };
    expect(waitingOnLead(afterSendBack)).toBe(true);
    expect(needsMe([afterSendBack], ME.lead).map((a) => a.id)).toEqual([afterSendBack.id]);
    expect(needsMe([afterSendBack], ME.artist)).toEqual([]);
  });
});

describe("the facts say what the checks found", () => {
  const facts = { tris: 12, textures: 1, scale: "1.00", uvSets: 1 };
  const check = (key: "textures" | "uv" | "scale" | "tris", pass: boolean, pending = false) => ({ key, pass, pending, sentence: "", fix: "Fix it." });
  it("a failed or unchecked texture row never claims the names are right, and no textures reads None", () => {
    const value = (pass: boolean, pending = false, textures = 1) => factsWithDeltas({ ...facts, textures }, undefined, [check("textures", pass, pending)])[1]!.value;
    expect(value(true)).toBe("1 named to the sheet");
    expect(value(false)).toBe("1 not named to the sheet");
    expect(value(false, true)).toBe("1");
    expect(value(true, false, 0)).toBe("None");
  });
  it("a delta says what changed since the last Version", () => {
    const rows = factsWithDeltas({ ...facts, textures: 3, uvSets: 2 }, facts, []);
    expect(rows.map((r) => [r.name, r.delta])).toEqual([["Triangles", "same"], ["Textures", "+2"], ["Scale", "metres"], ["UV sets", "+1"]]);
    expect(factsWithDeltas(facts, facts, []).map((r) => r.delta)).toEqual(["same", "same", "metres", "same"]);
  });
});

describe("the save in Unreal", () => {
  it("a mirrored save says where it is in plain words; with Unreal off there is no row", () => {
    expect(unrealRow(undefined)).toBeNull();
    expect(unrealRow("synced")).toMatchObject({ name: "Unreal", value: "In the editor", failed: false });
    expect(unrealRow("pending")).toMatchObject({ value: "On its way", pending: true });
    expect(unrealRow("failed")).toMatchObject({ value: "Did not arrive", failed: true, fix: "Open Unreal with the project, then save again in Blender." });
  });
});

describe("the export, read back in Blender (v8 step 17)", () => {
  const base = { tris: 12, textures: 1, scale: "1.00", uvSets: 1 };
  it("shows the rig, the animations and the export beside the four facts", () => {
    const facts = { ...base, bones: 42, animations: [{ name: "Walk", seconds: 1.25 }, { name: "Idle", seconds: 2 }], export: { intact: true, lines: ["Export intact."] } };
    const rows = factsWithDeltas(facts, { ...base, bones: 40, animations: [{ name: "Walk", seconds: 1.25 }] }, []);
    expect(rows.slice(4).map((r) => [r.name, r.value, r.delta, r.failed])).toEqual([["Rig", "42 bones", "+2", false], ["Animations", "Walk, Idle", "+1", false], ["Export", "Intact", "", false]]);
  });
  it("a loss reads as a failed row with every line it lost, and holds Publish like a red check", async () => {
    const facts = { ...base, export: { intact: false, lines: ["Animations not in the export: Walk.", "Bones gone since the last save: hand_R."] } };
    const row = factsWithDeltas(facts, undefined, []).find((r) => r.name === "Export")!;
    expect(row).toMatchObject({ value: "Animations not in the export: Walk.", failed: true, fix: "Bones gone since the last save: hand_R." });
    const { assets } = await load("studio", "artist");
    const own = assets.find((a) => a.owner.id === ME.artist.id)!;
    const live = { ...own, versions: [{ ...own.versions[0]!, note: "", checks: own.versions[0]!.checks.map((c) => ({ ...c, pass: true })), facts }, ...own.versions.slice(1)] };
    expect(publishState(live, "Walk cycle in.")).toMatchObject({ can: false, label: "Publish, after the export" });
  });
  it("a manifest from an older add-on shows none of the three", () => {
    expect(factsWithDeltas(base, undefined, []).map((r) => r.name)).toEqual(["Triangles", "Textures", "Scale", "UV sets"]);
  });
});

describe("publish on the asset page", () => {
  it("only the asset's own artist, and only when the newest save is not a Version yet", async () => {
    const { assets } = await load("studio", "artist");
    const own = assets.find((a) => a.owner.id === ME.artist.id)!;
    const mine = { ...own, versions: [{ ...own.versions[0]!, note: "" }, ...own.versions.slice(1)] };
    expect(canPublishHere({ ...mine, versions: [{ ...mine.versions[0]!, note: "Published." }] }, ME.artist)).toBe(false);
    const theirs = assets.find((a) => a.owner.id !== ME.artist.id)!;
    expect(canPublishHere(mine, ME.artist)).toBe(true);
    expect(canPublishHere(theirs, ME.artist)).toBe(false);
    expect(canPublishHere({ ...mine, versions: [] }, ME.artist)).toBe(false);
    expect(canPublishHere(mine, ME.lead)).toBe(false);
    expect(canPublishHere(mine, ME.viewer)).toBe(false);
  });
  it("a director is an artist on the assets they own", async () => {
    const { assets } = await load("studio", "artist");
    const own = assets.find((a) => a.owner.id === ME.artist.id)!;
    const mine = { ...own, versions: [{ ...own.versions[0]!, note: "" }, ...own.versions.slice(1)] };
    expect(canPublishHere({ ...mine, owner: ME.lead }, ME.lead)).toBe(true);
    expect(canPublishHere({ ...mine, owner: ME.artDirector }, ME.artDirector)).toBe(true);
  });
});

describe("publish from a Live save", () => {
  it("a check not reported yet does not block, a red one does, and the Live save publishes as its own number", async () => {
    const { assets } = await load("studio", "artist");
    const base = assets.find((a) => a.owner.id === ME.artist.id && a.versions.length > 0)!;
    const pending = { key: "uv" as const, pass: false, pending: true, sentence: "Not checked yet.", fix: "Unwrap the mesh." };
    const red = { key: "uv" as const, pass: false, sentence: "No UVs.", fix: "Unwrap the mesh." };
    const green = base.versions[0]!.checks.filter((c) => c.key !== "uv").map((c) => ({ ...c, pass: true }));
    const liveSave = { ...base, live: { savedAt: "now" }, versions: [{ ...base.versions[0]!, n: 3, note: "", checks: [...green, pending] }, ...base.versions.slice(1)] };
    expect(publishState(liveSave, "Rim smoothed.")).toMatchObject({ can: true, label: "Publish v3" });
    expect(publishState({ ...liveSave, versions: [{ ...liveSave.versions[0]!, checks: [...green, red] }] }, "Rim smoothed.")).toMatchObject({ can: false, label: "Publish, after the red one" });
  });
});

describe("sections on the wall", () => {
  it("top-level assets beside grouped ones sit under Other", async () => {
    const { assets } = await load("studio", "lead");
    const mixed = [{ ...assets[0]!, group: "Props" }, { ...assets[1]!, group: null }];
    expect(sectionsByGroup(mixed, mixed).map((s) => s.name)).toEqual(["Props", "Other"]);
    expect(sectionsByGroup([mixed[1]!], [mixed[1]!])).toEqual([{ name: "", titled: false, assets: [mixed[1]] }]);
  });
});
