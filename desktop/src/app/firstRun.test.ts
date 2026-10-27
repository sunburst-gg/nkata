// Where a signed in person lands on live data (firstRun.ts).
import { describe, expect, it } from "vitest";
import { firstRunScreen } from "./firstRun";

describe("the first run", () => {
  it("everyone but a viewer lands on Arrival until Blender has connected once on this computer", () => {
    expect(firstRunScreen("producer", false, true)).toBe("arrival");
    expect(firstRunScreen("artDirector", false, true)).toBe("arrival");
    expect(firstRunScreen("artist", false, true)).toBe("arrival");
    expect(firstRunScreen("viewer", false, false)).toBe("project");
  });
  it("and until the project has a place on this computer", () => {
    expect(firstRunScreen("artist", true, false)).toBe("arrival");
  });
  it("once both are done, the wall, from the first launch after: the answer is what this computer remembers, not Blender's state, which is still being detected at launch", () => {
    expect(firstRunScreen("producer", true, true)).toBe("project");
    expect(firstRunScreen("artist", true, true)).toBe("project");
  });
});
