import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { CheckContract } from "../ts/index.js";
import { CHECKS_DIR } from "../src/schema.js";

// docs/engineering.md, Checks: shipped v1 checks, by template.
const CHARACTER = ["texture_names", "unit_scale", "name_pattern", "triangle_budget", "uv_set_present", "texture_size", "rig_bone_names", "rig_bone_count", "metahuman_dna_present"];
const ENVIRONMENT = ["texture_names", "unit_scale", "name_pattern", "triangle_budget", "lod_count", "collision_present", "uv_set_present", "texture_size", "pivot_at_base"];
const SHIPPED = [...new Set([...CHARACTER, ...ENVIRONMENT])];

describe("shipped checks", () => {
  const files = readdirSync(CHECKS_DIR).filter((f) => f.endsWith(".json")).sort();

  it("ship exactly the two template lists, nothing else", () => {
    expect(files.map((f) => basename(f, ".json")).sort()).toEqual([...SHIPPED].sort());
    expect(CHARACTER).toHaveLength(9);
    expect(ENVIRONMENT).toHaveLength(9);
  });

  it("four checks block a Blender part: texture names, scale, UV sets, triangle budget", () => {
    // docs/tasks/07-blender-first.md. Every other check informs.
    const severity = (id: string) => CheckContract.parse(JSON.parse(readFileSync(join(CHECKS_DIR, `${id}.json`), "utf8"))).severity;
    for (const id of ["texture_names", "unit_scale", "uv_set_present", "triangle_budget"]) expect(severity(id), id).toBe("block");
    for (const id of ["name_pattern", "pivot_at_base", "texture_size"]) expect(severity(id), id).toBe("warn");
  });

  it("each validates against CheckContract and its id matches the file name", () => {
    for (const file of files) {
      const parsed = CheckContract.safeParse(JSON.parse(readFileSync(join(CHECKS_DIR, file), "utf8")));
      expect(parsed.success, `${file}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
      expect(parsed.data?.id).toBe(basename(file, ".json"));
    }
  });

  it("unit_scale, name_pattern, pivot_at_base, and texture_names auto fix", () => {
    const fixers = files
      .map((f) => CheckContract.parse(JSON.parse(readFileSync(join(CHECKS_DIR, f), "utf8"))))
      .filter((c) => c.auto_fix)
      .map((c) => c.id)
      .sort();
    expect(fixers).toEqual(["name_pattern", "pivot_at_base", "texture_names", "unit_scale"]);
  });
});
