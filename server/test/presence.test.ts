import { describe, expect, it } from "vitest";
import { createPresence, PRESENCE_TIMEOUT_MS } from "../src/presence.js";

const u = { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", name: "Ada", avatar_url: null };

describe("presence", () => {
  it("reports a change on join, on part change, and on sweep", () => {
    const p = createPresence();
    const t0 = new Date("2026-10-01T12:00:00Z");
    expect(p.heartbeat("proj", u, null, t0)).toBe(true);
    expect(p.heartbeat("proj", u, null, new Date(t0.getTime() + 1000))).toBe(false);
    expect(p.heartbeat("proj", u, "part", new Date(t0.getTime() + 2000))).toBe(true);
    expect(p.list("proj")[0]?.part_id).toBe("part");
    expect(p.sweep(new Date(t0.getTime() + 2000 + PRESENCE_TIMEOUT_MS))).toEqual([]);
    expect(p.sweep(new Date(t0.getTime() + 2001 + PRESENCE_TIMEOUT_MS))).toEqual(["proj"]);
    expect(p.list("proj")).toEqual([]);
  });
});
