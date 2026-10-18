// Every transition of the Blender connection machine, and the mock's jumps through it.
import { describe, expect, it } from "vitest";
import { apply, BLENDER_KINDS, dot, INITIAL, line, primary, supported, type BlenderState } from "./connection";
import { ADDON_VERSION, BLENDER_VERSION, MockDataSource, RISING_SUN } from "@/data/mock";

const one = [{ path: "/Applications/Blender.app", version: "4.2.3" }];
const connected: BlenderState = { kind: "connected", version: "4.2.3", addon: "1.4.0" };
const open: BlenderState = { kind: "open", version: "4.2.3", addon: "1.4.0", file: "market_stall.blend" };

describe("versions", () => {
  it("4.2 and newer are supported", () => {
    expect(supported("4.2.3")).toBe(true);
    expect(supported("4.2")).toBe(true);
    expect(supported("5.0.1")).toBe(true);
    expect(supported("4.1.9")).toBe(false);
    expect(supported("3.6")).toBe(false);
  });
});

describe("transitions", () => {
  it("detection: none, several, too old, found", () => {
    expect(apply(INITIAL, { type: "toolDetected", installs: [] })).toEqual({ kind: "notFound" });
    const two = [...one, { path: "/Applications/Blender 4.1.app", version: "4.1.1" }];
    expect(apply(INITIAL, { type: "toolDetected", installs: two })).toEqual({ kind: "several", found: two });
    expect(apply(INITIAL, { type: "toolDetected", installs: [{ path: "/x", version: "3.6.0" }] })).toEqual({ kind: "unsupported", version: "3.6.0" });
    expect(apply(INITIAL, { type: "toolDetected", installs: one })).toEqual({ kind: "found", version: "4.2.3" });
  });
  it("the same Blender seen again keeps a live connection", () => {
    expect(apply(connected, { type: "toolDetected", installs: one })).toBe(connected);
    expect(apply(open, { type: "toolDetected", installs: one })).toBe(open);
    expect(apply(connected, { type: "toolDetected", installs: [{ path: "/y", version: "4.3.0" }] })).toEqual({ kind: "found", version: "4.3.0" });
  });
  it("add-on installed connects; outdated asks for an update; an update with Blender open asks for a restart", () => {
    const found: BlenderState = { kind: "found", version: "4.2.3" };
    expect(apply(found, { type: "addonInstalled", addon: "1.4.0" })).toEqual(connected);
    const outdated = apply(found, { type: "addonOutdated", addon: "1.2.0", blenderOpen: false });
    expect(outdated).toEqual({ kind: "outdated", version: "4.2.3", addon: "1.2.0", blenderOpen: false });
    expect(apply(outdated, { type: "heartbeat", file: "a.blend" })).toEqual({ ...outdated, blenderOpen: true });
    expect(apply(outdated, { type: "addonInstalled", addon: "1.4.0", restart: true })).toEqual({ ...connected, restart: true });
    expect(line({ ...connected, restart: true })).toBe("Restart Blender to finish.");
  });
  it("heartbeat opens, lost heartbeat loses, reconnect reopens", () => {
    expect(apply(connected, { type: "heartbeat", file: "market_stall.blend" })).toEqual(open);
    const lost = apply(open, { type: "heartbeatLost" });
    expect(lost).toEqual({ kind: "lost", version: "4.2.3", addon: "1.4.0", file: "market_stall.blend" });
    expect(apply(lost, { type: "heartbeat", file: "market_stall.blend" })).toEqual(open);
    expect(apply(connected, { type: "heartbeatLost" })).toBe(connected);
    expect(apply({ kind: "found", version: "4.2.3" }, { type: "heartbeat", file: "a" })).toEqual({ kind: "found", version: "4.2.3" });
  });
  it("pause and resume", () => {
    const paused = apply(open, { type: "paused" });
    expect(paused).toEqual({ kind: "paused", version: "4.2.3", addon: "1.4.0" });
    expect(apply(paused, { type: "heartbeat", file: "a.blend" })).toEqual(paused);
    expect(apply(paused, { type: "resumed" })).toEqual(connected);
    expect(apply(connected, { type: "resumed" })).toBe(connected);
    expect(apply({ kind: "notFound" }, { type: "paused" })).toEqual({ kind: "notFound" });
  });
  it("disconnect from anywhere keeps the version it knew", () => {
    expect(apply(open, { type: "disconnected" })).toEqual({ kind: "disconnected", version: "4.2.3" });
    expect(apply({ kind: "notFound" }, { type: "disconnected" })).toEqual({ kind: "disconnected", version: null });
  });
});

describe("one line, at most one primary action", () => {
  it("every state has a line without a path and at most one primary action", () => {
    const states: BlenderState[] = [
      { kind: "notFound" }, { kind: "several", found: one }, { kind: "unsupported", version: "3.6" }, { kind: "found", version: "4.2.3" },
      { kind: "outdated", version: "4.2.3", addon: "1.2.0", blenderOpen: false }, connected, open,
      { kind: "lost", version: "4.2.3", addon: "1.4.0", file: "a.blend" }, { kind: "paused", version: "4.2.3", addon: "1.4.0" }, { kind: "disconnected", version: null },
    ];
    expect(states.map((s) => s.kind)).toEqual(BLENDER_KINDS);
    for (const s of states) {
      expect(line(s)).not.toMatch(/\//);
      expect(line(s).length).toBeLessThan(80);
      const p = primary(s);
      if (p) expect(["Find Blender", "Connect Blender", "Update", "Reconnect", "Resume"]).toContain(p.label);
    }
    expect(dot(connected)).toBe("ok");
    expect(dot(open)).toBe("live");
    expect(dot({ kind: "paused", version: "4.2.3", addon: "1.4.0" })).toBe("paused");
    expect(dot({ kind: "lost", version: "4.2.3", addon: "1.4.0", file: "a" })).toBe("action");
  });
});

describe("the mock", () => {
  it("jumps to every state through events, and the strip follows for an artist", async () => {
    const m = new MockDataSource({ stage: "studio", role: "artist" });
    const events: string[] = [];
    m.subscribe((e) => events.push(e.type));
    for (const kind of BLENDER_KINDS) { m.setBlender(kind); expect(m.blender.kind).toBe(kind); }
    expect(events).toContain("memberChanged");
    m.setBlender("open");
    expect((await m.listMembers(RISING_SUN.id)).find((x) => x.person.id === m.me.id)?.journey).toBe("inBlender");
    await m.disconnect();
    expect((await m.listMembers(RISING_SUN.id)).find((x) => x.person.id === m.me.id)?.journey).toBe("joined");
  });
  it("connect, pause, resume, reconnect, update end to end", async () => {
    const m = new MockDataSource({ stage: "studio", role: "artist" });
    await m.disconnect();
    await m.connectBlender();
    expect(m.blender).toEqual({ kind: "connected", version: BLENDER_VERSION, addon: ADDON_VERSION });
    await m.openBlender();
    expect(m.blender.kind).toBe("open");
    await m.pause();
    expect(m.blender.kind).toBe("paused");
    await m.resume();
    expect(m.blender.kind).toBe("connected");
    m.setBlender("lost");
    await m.reconnectBlender();
    expect(m.blender.kind).toBe("open");
    m.setBlender("outdated");
    await m.updateAddon();
    expect(m.blender).toMatchObject({ kind: "connected", addon: ADDON_VERSION });
    m.setBlender("notFound");
    await m.pickBlender();
    expect(m.blender).toEqual({ kind: "found", version: BLENDER_VERSION });
  });
  it("projects on this computer: move, stop syncing, sync again", async () => {
    const m = new MockDataSource({ stage: "studio", role: "artist" });
    const [rs] = await m.listLocalProjects();
    expect(rs).toMatchObject({ projectId: RISING_SUN.id, syncing: true });
    const to = await m.moveProject(RISING_SUN.id);
    expect((await m.listLocalProjects())[0]?.path).toBe(to);
    await m.stopSyncing(RISING_SUN.id);
    expect((await m.listLocalProjects())[0]?.syncing).toBe(false);
    await m.syncAgain(RISING_SUN.id);
    expect((await m.listLocalProjects())[0]?.syncing).toBe(true);
  });
});
