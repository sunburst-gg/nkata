// Where a signed in person lands on live data (firstRun.ts).
import { describe, expect, it } from "vitest";
import { firstRunScreen } from "./firstRun";

const never = { kind: "disconnected" as const, version: null };
const before = { kind: "disconnected" as const, version: "4.2.0" };

describe("the first run", () => {
  it("everyone but a viewer lands on Arrival until Blender has connected once on this computer", () => {
    expect(firstRunScreen("producer", never, true)).toBe("arrival");
    expect(firstRunScreen("artDirector", never, true)).toBe("arrival");
    expect(firstRunScreen("artist", never, true)).toBe("arrival");
    expect(firstRunScreen("viewer", never, false)).toBe("project");
  });
  it("and until the project has a place on this computer", () => {
    expect(firstRunScreen("artist", before, false)).toBe("arrival");
    expect(firstRunScreen("artist", { kind: "connected", version: "4.2.0", addon: "0.1.0" }, false)).toBe("arrival");
  });
  it("once both are done, the wall", () => {
    expect(firstRunScreen("producer", before, true)).toBe("project");
    expect(firstRunScreen("artist", { kind: "connected", version: "4.2.0", addon: "0.1.0" }, true)).toBe("project");
  });
});
