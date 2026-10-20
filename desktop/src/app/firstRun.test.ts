// Where a signed in person lands on live data (firstRun.ts).
import { describe, expect, it } from "vitest";
import { firstRunScreen } from "./firstRun";

const never = { kind: "disconnected" as const, version: null };
const before = { kind: "disconnected" as const, version: "4.2.0" };

describe("the first run", () => {
  it("everyone but a viewer lands on Arrival until Blender has connected once on this computer", () => {
    expect(firstRunScreen("producer", never)).toBe("arrival");
    expect(firstRunScreen("artDirector", never)).toBe("arrival");
    expect(firstRunScreen("artist", never)).toBe("arrival");
    expect(firstRunScreen("viewer", never)).toBe("project");
  });
  it("once Blender was seen here, or is connected, the wall", () => {
    expect(firstRunScreen("producer", before)).toBe("project");
    expect(firstRunScreen("artist", { kind: "connected", version: "4.2.0", addon: "0.1.0" })).toBe("project");
  });
});
