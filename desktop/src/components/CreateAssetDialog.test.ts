import { describe, expect, it } from "vitest";
import { assetNameFor } from "./CreateAssetDialog";

describe("assetNameFor", () => {
  it("names the asset after the file's stem", () => {
    expect(assetNameFor("props/old_lamp.blend")).toBe("old_lamp");
    expect(assetNameFor("Market stall.blend")).toBe("Market stall");
  });
  it("turns what the server refuses into spaces and never answers empty", () => {
    expect(assetNameFor("props/lamp.v2 (final).blend")).toBe("lamp v2 final");
    expect(assetNameFor("props/.blend")).toBe("Asset");
    expect(assetNameFor("props/--x.blend")).toBe("x");
  });
});
