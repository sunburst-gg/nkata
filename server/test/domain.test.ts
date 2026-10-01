import { describe, expect, it } from "vitest";
import { evaluateGates, waitingOn } from "../src/domain/gates.js";
import { decideGrant, EXPIRES_AFTER_MS, expiryFrom, isStale, STALE_AFTER_MS } from "../src/domain/locks.js";
import { transition } from "../src/domain/state.js";
import { AppError } from "../src/domain/errors.js";

describe("gate evaluation", () => {
  const parts = [
    { id: "a", name: "face", state: "approved" as const, gate: { after: [] } },
    { id: "b", name: "cloth", state: "approved" as const, gate: { after: [] } },
    { id: "c", name: "hair", state: "draft" as const, gate: { after: [] } },
    { id: "d", name: "textures", state: "locked" as const, gate: { after: ["face", "cloth", "hair"] } },
    { id: "e", name: "rig", state: "locked" as const, gate: { after: ["textures"] } },
    { id: "f", name: "sound", state: "locked" as const, gate: { after: ["face"] } },
  ];

  it("opens a gate only when every named part is approved", () => {
    expect(evaluateGates(parts)).toEqual([{ part_id: "f", opened_by: ["a"] }]);
  });

  it("opens the next gate once the chain is approved", () => {
    const later = parts.map((p) => (p.name === "hair" ? { ...p, state: "approved" as const } : p));
    expect(evaluateGates(later).map((o) => o.part_id).sort()).toEqual(["d", "f"]);
  });

  it("opens a locked part whose gate was removed", () => {
    const removed = parts.map((p) => (p.name === "rig" ? { ...p, gate: { after: [] } } : p));
    expect(evaluateGates(removed).map((o) => o.part_id).sort()).toEqual(["e", "f"]);
  });

  it("keeps a gate closed when it names an unknown part", () => {
    const bad = [{ id: "x", name: "x", state: "locked" as const, gate: { after: ["nope"] } }];
    expect(evaluateGates(bad)).toEqual([]);
  });

  it("lists what a part still waits on", () => {
    expect(waitingOn(parts[3]!, parts)).toEqual(["hair"]);
  });
});

describe("lock grant", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  const row = { holder_id: "u1", granted_at: now, heartbeat_at: now, expires_at: expiryFrom(now) };

  it("grants when no lock exists", () => {
    expect(decideGrant(null, "u2", now)).toEqual({ kind: "grant" });
  });
  it("refreshes for the holder", () => {
    expect(decideGrant(row, "u1", now)).toEqual({ kind: "refresh" });
  });
  it("reports the holder to someone else", () => {
    expect(decideGrant(row, "u2", now)).toEqual({ kind: "held", holder_id: "u1" });
  });
  it("grants to someone else after expiry", () => {
    const later = new Date(now.getTime() + EXPIRES_AFTER_MS + 1);
    expect(decideGrant(row, "u2", later)).toEqual({ kind: "grant" });
  });
  it("is stale after two minutes without a heartbeat", () => {
    expect(isStale(row, new Date(now.getTime() + STALE_AFTER_MS))).toBe(false);
    expect(isStale(row, new Date(now.getTime() + STALE_AFTER_MS + 1))).toBe(true);
  });
});

describe("state transitions", () => {
  const artist = { user_id: "u1", roles: ["artist" as const] };
  const other = { user_id: "u2", roles: ["artist" as const] };
  const ad = { user_id: "u3", roles: ["art_director" as const] };

  it("owner marks ready", () => expect(transition("draft", "mark_ready", artist, "u1")).toBe("ready"));
  it("non owner artist cannot mark ready", () => expect(() => transition("draft", "mark_ready", other, "u1")).toThrow(AppError));
  it("art director approves a ready part", () => expect(transition("ready", "approve", ad, "u1")).toBe("approved"));
  it("artist cannot approve", () => expect(() => transition("ready", "approve", artist, "u1")).toThrow(/role cannot/));
  it("cannot approve a draft", () => expect(() => transition("draft", "approve", ad, "u1")).toThrow(/cannot approve/));
  it("send back returns to draft", () => expect(transition("approved", "send_back", ad, "u1")).toBe("draft"));
  it("gate open is a system action", () => expect(transition("locked", "gate_open", null, null)).toBe("draft"));
  it("gate open only from locked", () => expect(() => transition("draft", "gate_open", null, null)).toThrow(AppError));
});
