import { describe, expect, it } from "vitest";
import { diffLines, diffManifests } from "./diff";

const v2 = { bones: 42, objects: [{ name: "Face", triangles: 1200, materials: ["M_Skin"], hash: "a" }, { name: "Eyes", triangles: 300, materials: ["M_Eye"], hash: "e" }, { name: "Hat", triangles: 80, materials: ["M_Cloth"], hash: "h" }] };
const v3 = { bones: 42, objects: [{ name: "Face", triangles: 1400, materials: ["M_Skin", "M_Scar"], hash: "b" }, { name: "Eyes", triangles: 300, materials: ["M_Eye"], hash: "e" }, { name: "Teeth", triangles: 120, materials: ["M_Teeth"], hash: "t" }] };

describe("what changed", () => {
  it("finds added, removed, and touched objects by hash, plus triangles and materials", () => {
    const d = diffManifests(v2, v3)!;
    expect(d).toMatchObject({ added: ["Teeth"], removed: ["Hat"], touched: ["Face"], same: 1, triangles: { before: 1580, after: 1820 } });
    expect(d.materials).toEqual({ added: ["M_Scar", "M_Teeth"], removed: ["M_Cloth"] });
    expect(diffLines(d).map((l) => l.text)).toEqual(["Teeth added", "Hat removed", "Face changed", "Triangles 1,580 to 1,820 (+240)", "Material M_Scar added", "Material M_Teeth added", "Material M_Cloth removed", "1 object unchanged"]);
  });

  it("says so when nothing changed, and nothing without two manifests", () => {
    expect(diffLines(diffManifests(v2, v2)!)).toEqual([{ text: "Nothing changed. 3 objects are the same.", tone: "same" }]);
    expect(diffManifests(undefined, v3)).toBeNull();
  });
});
