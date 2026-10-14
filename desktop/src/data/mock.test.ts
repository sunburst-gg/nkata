import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSource } from "./mock";

describe("mock data source", () => {
  it("holds Sunburst across the four demo stages", () => {
    const src = createMockSource();
    expect(src.stage()).toBe("fresh");
    expect(src.snapshot().session.studio.projects).toEqual([]);
    expect(src.snapshot().connections.find((c) => c.id === "blender")?.connected).toBe(false);
    src.setStage("connected");
    expect(src.snapshot().session.studio.projects.map((p) => p.name)).toEqual(["NkataTest"]);
    // Unreal is Coming soon: Blender alone connects, the Unreal card says mirror ships next.
    expect(src.snapshot().connections.filter((c) => c.connected).map((c) => c.id)).toEqual(["blender"]);
    expect(src.snapshot().connections.find((c) => c.id === "unreal")).toMatchObject({ soon: true, connected: false });
    src.setStage("populated");
    const db = src.snapshot();
    expect(db.session.studio.projects.map((p) => p.name)).toEqual(["NkataTest", "Rising Sun"]);
    expect(db.assets.filter((a) => a.projectSlug === "rising-sun").map((a) => a.name)).toEqual(["Market stall", "Ojukwu", "Enugu Market", "Compound", "Kettle", "Ngozi"]);
    expect(db.people.map((p) => p.name.split(" ")[0])).toEqual(["Emmanuel", "Ada", "Chidi", "Ngozi", "Emeka", "Tobe", "Ify"]);
    expect(db.session.user.role).toBe("producer");
    expect(db.session.studio.training).toBe("off");
    expect(db.session.studio.billing).toEqual({ line: "Free while Nkata is in testing", seats: 7 });
    expect(db.mentions).toHaveLength(2);
    for (const a of db.assets) for (const p of a.parts) expect(db.people.some((x) => x.id === p.ownerId), `${a.name}/${p.name} owner`).toBe(true);
    for (const a of db.assets) expect(a.model).toBe("/models/Duck.glb");
  });

  it("mark ready is blocked by a failing check until it is fixed", () => {
    const src = createMockSource({ stage: "populated" });
    expect(src.markReady("ojukwu", "face")).toMatchObject({ ok: false });
    src.fixChecks("ojukwu", "face");
    expect(src.markReady("ojukwu", "face")).toEqual({ ok: true });
    expect(src.snapshot().assets.find((a) => a.slug === "ojukwu")!.parts[0]!.state).toBe("ready");
  });

  it("roll back makes a new version and keeps every old one", () => {
    const src = createMockSource({ stage: "populated" });
    const face = () => src.snapshot().assets.find((a) => a.slug === "ojukwu")!.parts[0]!;
    expect(face().versions.map((v) => v.n)).toEqual([3, 2, 1]);
    const made = src.rollBack("ojukwu", "face", 2);
    expect(made).toMatchObject({ n: 4, from: 2 });
    expect(face().versions.map((v) => v.n)).toEqual([4, 3, 2, 1]);
  });

  it("removing a gate opens the part and logs it", () => {
    const src = createMockSource({ stage: "populated" });
    src.removeGate("ojukwu", "textures");
    const db = src.snapshot();
    expect(db.assets.find((a) => a.slug === "ojukwu")!.parts.find((p) => p.name === "textures")?.state).toBe("draft");
    expect(db.activity[0]?.text).toContain("removed the gate on Ojukwu / textures");
  });

  it("a pinned comment keeps its point and a reply has none", () => {
    const src = createMockSource({ stage: "populated" });
    const pin = src.addComment("ojukwu", "face", "Too deep.", [0.1, 0.2, 0.3]);
    const reply = src.addComment("ojukwu", "face", "On it.");
    expect(pin.pos).toEqual([0.1, 0.2, 0.3]);
    expect(reply.pos).toBeUndefined();
    expect(src.snapshot().assets.find((a) => a.slug === "ojukwu")!.parts[0]!.comments.map((c) => c.text)).toContain("Too deep.");
  });

  it("confirms the rights to an asset in one line", () => {
    const src = createMockSource({ stage: "connected" });
    src.createAsset("nkatatest", "Market stall", "Environment prop", "one");
    expect(src.snapshot().assets.find((a) => a.slug === "market-stall")!.rights).toBeNull();
    src.confirmRights("market-stall", "Sunburst owns this asset outright.");
    const after = src.snapshot().assets.find((a) => a.slug === "market-stall")!;
    expect(after.rights?.statement).toBe("Sunburst owns this asset outright.");
    expect(src.snapshot().activity[0]?.text).toBe("confirmed the rights to Market stall");
  });

  it("assigns a part to a person and clears it", () => {
    const src = createMockSource({ stage: "connected" });
    src.createAsset("nkatatest", "Market stall", "Environment prop", "one");
    const asset = src.snapshot().assets.find((a) => a.slug === "market-stall")!;
    const part = asset.parts[0]!;
    const other = src.snapshot().people.find((p) => p.id !== part.ownerId)!;
    src.assignOwner(asset.slug, part.name, other.id);
    expect(src.snapshot().assets.find((a) => a.slug === asset.slug)!.parts[0]!.ownerId).toBe(other.id);
    expect(src.snapshot().activity[0]?.text).toBe(`assigned ${asset.name} / ${part.name} to ${other.name.split(" ")[0]}`);
    src.assignOwner(asset.slug, part.name, null);
    expect(src.snapshot().assets.find((a) => a.slug === asset.slug)!.parts[0]!.ownerId).toBe("");
  });

  describe("the first asset", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());
    it("starts with one part and gets its render on the first save", () => {
      const src = createMockSource({ stage: "connected" });
      const made = src.createAsset("nkatatest", "Market stall", "Environment prop", "one");
      if (made instanceof Promise) throw new Error("the mock is synchronous");
      expect(made.parts.map((p) => p.name)).toEqual(["model"]);
      expect(made.render).toBeNull();
      vi.advanceTimersByTime(1500);
      const after = src.snapshot().assets.find((a) => a.slug === "market-stall")!;
      expect(after.render).not.toBeNull();
      expect(after.parts[0]!.versions).toHaveLength(1);
      expect(src.snapshot().activity[0]?.text).toBe("published Market stall / model, v1");
    });
  });

  it("answers the Ojukwu question with the gate, the owner, and a link", () => {
    const src = createMockSource({ stage: "populated" });
    const a = src.ask("What is blocking Ojukwu");
    expect(a.answer).toContain("waiting on face");
    expect(a.link).toEqual({ label: "Open Ojukwu / face", assetSlug: "ojukwu", partName: "face" });
  });

  it("training can still change underneath, and billing stays free while Nkata is in testing", async () => {
    const src = createMockSource({ stage: "populated" });
    await src.setTraining("on");
    expect(src.snapshot().session.studio.training).toBe("on");
    expect(src.snapshot().session.studio.billing.line).toBe("Free while Nkata is in testing");
    expect(src.snapshot().trainingLog[0]?.text).toContain("Training on");
  });
});
