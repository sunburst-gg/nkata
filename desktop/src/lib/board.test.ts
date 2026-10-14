import { describe, expect, it } from "vitest";
import type { Asset, Check, Part } from "@/data/types";
import { boardCounts, boardRows, EMPTY_FILTER, filterRows, isMyMove, moveOf, waitingLabel } from "./board";

const NOW = Date.parse("2026-10-14T12:00:00Z");
const H = 3_600_000;
const check = (id: string, severity: Check["severity"], status: Check["status"]): Check => ({ id, name: id, detail: "", status, blocks: status === "fail" && severity === "block", severity, fixable: false });

function part(name: string, state: Part["state"], ownerId: string, sinceHours: number | null, note = ""): Part {
  return { id: name, name, state, ownerId, render: null, lock: null, gate: [], versions: note ? [{ id: `${name}-v2`, n: 2, note, published: true, render: null, authorId: ownerId, when: "1 h", mirror: "synced" }, { id: `${name}-v1`, n: 1, note: "", published: false, render: null, authorId: ownerId, when: "2 h", mirror: "synced" }] : [], checks: [check("texture_names", "block", "pass"), check("unit_scale", "block", "fail"), check("name_pattern", "warn", "fail")], comments: [], mirror: { state: "offline", seconds: 0 }, refs: [], file: null, exportName: `SM_${name}`, ...(sinceHours === null ? {} : { stateSince: new Date(NOW - sinceHours * H).toISOString() }) };
}
function asset(name: string, template: string, folder: string, parts: Part[]): Asset {
  return { id: name, slug: name.toLowerCase(), projectSlug: "p", name, kind: "Props", state: "draft", render: null, meta: "", ownerId: parts[0]?.ownerId ?? "", present: [], parts, template, usedIn: [], changedOrder: 0, when: "", rights: null, folder };
}

const assets = [
  asset("Stall", "Environment prop", "Market", [part("model", "ready", "ada", 5, "Rebuilt the roof")]),
  asset("Ojukwu", "Character", "", [part("face", "draft", "ada", 30), part("body", "waiting", "chidi", 2), part("rig", "approved", "chidi", 1, "Final rig")]),
  asset("Kettle", "Environment prop", "Market", [part("model", "locked", "tobe", null)]),
];

describe("the board", () => {
  const rows = boardRows(assets, NOW);

  it("makes one row per part with the blocking dots, whose move, and the last note", () => {
    const stall = rows.find((r) => r.key === "stall/model")!;
    expect(stall).toMatchObject({ assetName: "Stall", partName: "model", template: "Environment prop", folder: "Market", ownerId: "ada", state: "ready", move: "reviewers", lastNote: "Rebuilt the roof", publishedWhen: "1 h", waitingMs: 5 * H });
    expect(stall.dots.map((d) => d.id)).toEqual(["texture_names", "unit_scale"]);
    expect(rows.find((r) => r.key === "ojukwu/face")!.lastNote).toBe("");
  });

  it("sorts waiting longest first, untimed rows after, done rows last", () => {
    expect(rows.map((r) => r.key)).toEqual(["ojukwu/face", "stall/model", "ojukwu/body", "kettle/model", "ojukwu/rig"]);
  });

  it("counts in work, waiting on review, and approved", () => {
    expect(boardCounts(rows)).toEqual({ inWork: 3, waitingOnReview: 1, approved: 1 });
  });

  it("names whose move it is from the state alone", () => {
    expect(["draft", "locked", "ready", "waiting", "approved"].map((s) => moveOf(s as Part["state"]))).toEqual(["owner", "owner", "reviewers", "gate", "done"]);
  });

  it("filters by owner, state, template, folder, and waiting on me", () => {
    expect(filterRows(rows, { ...EMPTY_FILTER, owner: "chidi" }).map((r) => r.key)).toEqual(["ojukwu/body", "ojukwu/rig"]);
    expect(filterRows(rows, { ...EMPTY_FILTER, state: "ready" }).map((r) => r.key)).toEqual(["stall/model"]);
    expect(filterRows(rows, { ...EMPTY_FILTER, template: "Character" })).toHaveLength(3);
    expect(filterRows(rows, { ...EMPTY_FILTER, folder: "Market" }).map((r) => r.key)).toEqual(["stall/model", "kettle/model"]);
    expect(filterRows(rows, { ...EMPTY_FILTER, me: { id: "ada", reviews: false } }).map((r) => r.key)).toEqual(["ojukwu/face"]);
    expect(filterRows(rows, { ...EMPTY_FILTER, me: { id: "emeka", reviews: true } }).map((r) => r.key)).toEqual(["stall/model"]);
    expect(filterRows(rows, { ...EMPTY_FILTER, me: { id: "tobe", reviews: true } }).map((r) => r.key)).toEqual(["stall/model", "kettle/model"]);
  });

  it("a gated or approved part is nobody's move", () => {
    expect(isMyMove(rows.find((r) => r.key === "ojukwu/body")!, { id: "chidi", reviews: true })).toBe(false);
    expect(isMyMove(rows.find((r) => r.key === "ojukwu/rig")!, { id: "chidi", reviews: true })).toBe(false);
  });

  it("reads a wait as minutes, hours, or days", () => {
    expect([null, 30_000, 4 * 60_000, 3 * H, 50 * H].map(waitingLabel)).toEqual(["", "now", "4 min", "3 h", "2 d"]);
  });
});
