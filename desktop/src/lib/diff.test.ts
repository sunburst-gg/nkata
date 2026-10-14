import { describe, expect, it } from "vitest";
import { diffLines, diffManifests } from "./diff";

const v2 = { bones: 42, unitScale: 1, textures: [{ name: "T_Face_D", width: 2048, height: 2048 }, { name: "face normal", width: 2048, height: 2048 }], objects: [{ name: "Face", triangles: 1200, materials: ["M_Skin"], hash: "a", uvSets: ["UVMap"] }, { name: "Eyes", triangles: 300, materials: ["M_Eye"], hash: "e", uvSets: ["UVMap"] }, { name: "Hat", triangles: 80, materials: ["M_Cloth"], hash: "h", uvSets: ["UVMap"] }] };
const v3 = { bones: 42, unitScale: 1, textures: [{ name: "T_Face_D", width: 2048, height: 2048 }, { name: "T_Face_N", width: 2048, height: 2048 }, { name: "T_Scar", width: 512, height: 512 }], objects: [{ name: "Face", triangles: 1400, materials: ["M_Skin", "M_Scar"], hash: "b", uvSets: ["UVMap", "Lightmap"] }, { name: "Eyes", triangles: 300, materials: ["M_Eye"], hash: "e", uvSets: ["UVMap"] }, { name: "Teeth", triangles: 120, materials: ["M_Teeth"], hash: "t", uvSets: ["UVMap"] }] };

describe("what changed", () => {
  it("finds added, removed, and touched objects by hash, plus triangles and materials", () => {
    const d = diffManifests(v2, v3)!;
    expect(d).toMatchObject({ added: ["Teeth"], removed: ["Hat"], touched: ["Face"], same: 1, triangles: { before: 1580, after: 1820 } });
    expect(d.materials).toEqual({ added: ["M_Scar", "M_Teeth"], removed: ["M_Cloth"] });
    expect(d.textures).toEqual({ added: ["T_Scar"], removed: [], renamed: [{ from: "face normal", to: "T_Face_N" }] });
    expect(d.uvSets).toEqual({ before: ["UVMap"], after: ["Lightmap", "UVMap"] });
    expect(diffLines(d).map((l) => l.text)).toEqual(["Teeth added", "Hat removed", "Face changed", "Triangles 1,580 to 1,820 (+240)", "Material M_Scar added", "Material M_Teeth added", "Material M_Cloth removed", "Texture face normal renamed to T_Face_N", "Texture T_Scar added", "UV sets UVMap to Lightmap, UVMap", "1 object unchanged"]);
  });

  it("says so when nothing changed, and nothing without two manifests", () => {
    expect(diffLines(diffManifests(v2, v2)!)).toEqual([{ text: "Nothing changed. 3 objects are the same.", tone: "same" }]);
    expect(diffManifests(undefined, v3)).toBeNull();
  });
});
