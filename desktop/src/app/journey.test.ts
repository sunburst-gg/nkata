import { describe, expect, it } from "vitest";
import { apply, BEAT_TIMEOUT_MS, forward, merge, settle, type MemberState } from "./journey";

const at = (journey: MemberState["journey"], lastBeat: number | null = null): MemberState => ({ journey, lastBeat });

describe("the team strip state machine", () => {
  it("moves forward through invited, joined, blender, inBlender and never back", () => {
    expect(forward("invited", "joined")).toBe("joined");
    expect(forward("joined", "blender")).toBe("blender");
    expect(forward("blender", "inBlender")).toBe("inBlender");
    expect(forward("inBlender", "joined")).toBe("inBlender");
    expect(forward("blender", "invited")).toBe("blender");
  });
  it("a memberChanged event moves forward only", () => {
    expect(apply(at("invited"), { type: "memberChanged", journey: "joined" }, 0).journey).toBe("joined");
    expect(apply(at("blender"), { type: "memberChanged", journey: "invited" }, 0).journey).toBe("blender");
  });
  it("a presence beat with a file means In Blender and remembers the beat", () => {
    expect(apply(at("joined"), { type: "presence", file: "market_stall.blend" }, 100)).toEqual({ journey: "inBlender", lastBeat: 100 });
  });
  it("a presence beat without a file means Blender, and does not pull an In Blender member back", () => {
    expect(apply(at("joined"), { type: "presence", file: null }, 100)).toEqual({ journey: "blender", lastBeat: null });
    expect(apply(at("inBlender", 50), { type: "presence", file: null }, 100).journey).toBe("inBlender");
  });
  it("In Blender falls back to Blender after 60 s without a beat, and only then", () => {
    const s = at("inBlender", 1000);
    expect(settle(s, 1000 + BEAT_TIMEOUT_MS - 1).journey).toBe("inBlender");
    expect(settle(s, 1000 + BEAT_TIMEOUT_MS)).toEqual({ journey: "blender", lastBeat: null });
    expect(settle(at("joined"), 10 ** 9).journey).toBe("joined");
  });
  it("merges the roster with the machine: the further state wins, the timeout applies", () => {
    expect(merge("invited", undefined, 0)).toBe("invited");
    expect(merge("invited", at("joined"), 0)).toBe("joined");
    expect(merge("blender", at("inBlender", 0), BEAT_TIMEOUT_MS)).toBe("blender");
    expect(merge("inBlender", at("blender"), 0)).toBe("inBlender");
    expect(merge("inBlender", at("inBlender", 0), BEAT_TIMEOUT_MS)).toBe("blender");
  });
});
