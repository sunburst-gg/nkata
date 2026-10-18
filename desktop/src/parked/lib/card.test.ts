import { describe, expect, it } from "vitest";
import { publishCard } from "./card";

const v1 = { bones: null, unitScale: 1, textures: [{ name: "T_Stall_D", width: 2048, height: 2048 }, { name: "stall normal", width: 2048, height: 2048 }], objects: [{ name: "SM_Stall", triangles: 12000, materials: ["M_Stall"], hash: "a", uvSets: ["UVMap"] }] };
const v2 = { bones: null, unitScale: 1, textures: [{ name: "T_Stall_D", width: 2048, height: 2048 }, { name: "T_Stall_N", width: 2048, height: 2048 }, { name: "T_Cloth", width: 1024, height: 1024 }], objects: [{ name: "SM_Stall", triangles: 14000, materials: ["M_Stall"], hash: "b", uvSets: ["UVMap", "Lightmap"] }] };

describe("the publish card", () => {
  it("reads the numbers from the manifest and nothing else", () => {
    const card = publishCard(v1)!;
    expect(card.rows).toEqual([
      { label: "Triangles", value: "12,000" },
      { label: "Textures", value: "2" },
      { label: "Scale", value: "1.0" },
      { label: "UV sets", value: "UVMap" },
    ]);
    expect(card.textureNames).toEqual(["T_Stall_D", "stall normal"]);
  });

  it("puts the delta from the previous publish beside each value", () => {
    const card = publishCard(v2, v1)!;
    expect(card.rows[0]).toEqual({ label: "Triangles", value: "14,000", delta: "+2,000", tone: "up" });
    expect(card.rows[1]).toEqual({ label: "Textures", value: "3", delta: "1 renamed, +1", tone: "changed" });
    expect(card.rows[2]).toEqual({ label: "Scale", value: "1.0" });
    expect(card.rows[3]).toEqual({ label: "UV sets", value: "Lightmap, UVMap", delta: "was UVMap", tone: "changed" });
    expect(publishCard(v1, v2)!.rows[0]).toMatchObject({ delta: "−2,000", tone: "down" });
  });

  it("is null without a manifest, and shows a dash for an old manifest with no scale", () => {
    expect(publishCard(undefined)).toBeNull();
    expect(publishCard({ ...v1, unitScale: null })!.rows[2]).toEqual({ label: "Scale", value: "—" });
  });
});
