import { describe, expect, it } from "vitest";
import { createMockSource } from "./mock";

describe("mock data source", () => {
  it("holds the Rising Sun content", () => {
    const db = createMockSource().snapshot();
    expect(db.assets.map((a) => a.name)).toEqual(expect.arrayContaining(["Ojukwu", "Enugu Market", "Compound", "Kettle"]));
    expect(new Set(db.assets.map((a) => a.kind))).toEqual(new Set(["Characters", "Props", "Levels"]));
    expect(db.templates.map((t) => t.name)).toEqual(["Character", "Environment prop", "Level area"]);
    expect(db.people.map((p) => p.name.split(" ")[0])).toEqual(expect.arrayContaining(["Ada", "Chidi", "Ngozi", "Emeka", "Tobe", "Funmi"]));
    expect(db.people.find((p) => p.name === "Funmi Adebayo")?.role).toBe("viewer");
    expect(new Set(db.people.map((p) => p.role))).toEqual(new Set(["artist", "art_director", "producer", "viewer"]));
    for (const a of db.assets) for (const p of a.parts) expect(db.people.some((x) => x.id === p.ownerId), `${a.name}/${p.name} owner`).toBe(true);
  });

  it("mark ready is blocked by a failing check until it is fixed", () => {
    const src = createMockSource();
    expect(src.markReady("ojukwu", "face")).toMatchObject({ ok: false });
    src.fixChecks("ojukwu", "face");
    expect(src.markReady("ojukwu", "face")).toEqual({ ok: true });
    expect(src.snapshot().assets[0]!.parts[0]!.state).toBe("ready");
  });

  it("roll back makes a new version and keeps every old one", () => {
    const src = createMockSource();
    const before = src.snapshot().assets[0]!.parts[0]!.versions.map((v) => v.n);
    const made = src.rollBack("ojukwu", "face", 12);
    const after = src.snapshot().assets[0]!.parts[0]!.versions;
    expect(made.n).toBe(15);
    expect(made.from).toBe(12);
    expect(after.map((v) => v.n)).toEqual([15, ...before]);
  });

  it("removing a gate opens the part and logs it", () => {
    const src = createMockSource();
    src.removeGate("ojukwu", "textures");
    const db = src.snapshot();
    expect(db.assets[0]!.parts.find((p) => p.name === "textures")?.state).toBe("draft");
    expect(db.activity[0]?.text).toContain("removed the gate on textures");
  });
});
