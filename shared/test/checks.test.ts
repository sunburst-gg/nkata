import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { CheckContract } from "../ts/index.js";
import { CHECKS_DIR } from "../src/schema.js";

// docs/engineering.md, Checks: shipped v1 checks.
const SHIPPED = [
  "unit_scale", "name_pattern", "triangle_budget", "lod_count", "collision_present",
  "uv_set_present", "texture_size", "rig_bone_names", "rig_bone_count", "metahuman_dna_present",
];

describe("shipped checks", () => {
  const files = readdirSync(CHECKS_DIR).filter((f) => f.endsWith(".json")).sort();

  it("ship exactly the v1 list", () => {
    expect(files.map((f) => basename(f, ".json")).sort()).toEqual([...SHIPPED].sort());
  });

  it("each validates against CheckContract and its id matches the file name", () => {
    for (const file of files) {
      const parsed = CheckContract.safeParse(JSON.parse(readFileSync(join(CHECKS_DIR, file), "utf8")));
      expect(parsed.success, `${file}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
      expect(parsed.data?.id).toBe(basename(file, ".json"));
    }
  });

  it("only unit_scale and name_pattern auto fix", () => {
    const fixers = files
      .map((f) => CheckContract.parse(JSON.parse(readFileSync(join(CHECKS_DIR, f), "utf8"))))
      .filter((c) => c.auto_fix)
      .map((c) => c.id)
      .sort();
    expect(fixers).toEqual(["name_pattern", "unit_scale"]);
  });
});
