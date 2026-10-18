// The prototype's wall: 30 items, 7 of every 10 objects, built from the eight sample models
// and the five renders, with its notes, times, owners and groups. Ported from renderVals().
import type { Key } from "./people";

export const GLB = (n: string): string => `/fixtures/glb/${n}.glb`;
export const RENDER = (n: string): string => `/fixtures/renders/compound-${n}.png`;

export const OBJ: [name: string, model: string, note: string][] = [
  ["Radio", "BoomBox", "Dial glass added. Knobs turn."],
  ["Market lantern", "Lantern", "Hinge worn, glass dirtied. Emissive in R."],
  ["Toy car", "ToyCar", "Wheels true. Paint chipped at the edges."],
  ["Chair", "SheenChair", "Seat fabric has sheen now. Legs straightened."],
  ["Press camera", "AntiqueCamera", "Bellows rebuilt. Brass pass done."],
  ["Canteen", "WaterBottle", "Dents on the base. Label texture on the sheet."],
  ["Helmet", "DamagedHelmet", "Scratches follow the strap now."],
  ["Soldier (blockout)", "CesiumMan", "Proportions only. No textures yet."],
];

export const ENV: [name: string, render: string, note: string][] = [
  ["Compound ground", "ground", "Dust pass on the ground. Footprints near the door."],
  ["Courtyard", "courtyard", "Washing line added. Chairs are separate objects."],
  ["Shade tree", "tree", "Canopy as cards now. Half the triangles."],
  ["Interior set", "interior", "Pots and baskets placed. Floor decal fixed."],
  ["Compound overview", "overview", "Roof planes aligned. Shadows read right from above."],
];

export const TIMES = ["2 min ago", "18 min ago", "1 h ago", "3 h ago", "Today", "Yesterday", "Yesterday", "2 days ago", "3 days ago", "Last week", "Last week", "2 wk ago", "3 wk ago"];
export const OWNERS: Key[] = ["A", "C", "N", "T", "K", "D"];
export const TRIS = [16200, 48000, 2100, 31000, 22000, 1800, 19000];
export const PREV_TRIS: (number | null)[] = [14100, 46000, 2400, null, 22000, null, 17500];
/** The older Versions' notes, by distance from the current one. */
export const OLD_NOTES = ["Blockout to proportions.", "First texture pass, names off the sheet.", "Scale fixed. UVs split.", "Detail pass. Seams open."];

export interface Item { name: string; model: string | null; render: string | null; note: string; isEnv: boolean }

export function items(): Item[] {
  const out: Item[] = [];
  for (let i = 0; i < 30; i++) {
    const suffix = i >= 10 ? ` ${Math.floor(i / 10) + 1}` : "";
    if (i % 10 < 7) {
      const o = OBJ[(i * 3) % 8]!;
      out.push({ name: o[0] + suffix, model: o[1], render: "ground", note: o[2], isEnv: false });
    } else {
      const e = ENV[(i * 7) % 5]!;
      out.push({ name: e[0] + suffix, model: null, render: e[1], note: e[2], isEnv: true });
    }
  }
  return out;
}

/** The sample project's one asset. */
export const SAMPLE = { name: "Market stall", note: "Awning cloth added. Crates stacked two high. Textures on the sheet.", time: "3 days ago", tris: 16200, prevTris: 14100, tex: 3 };
