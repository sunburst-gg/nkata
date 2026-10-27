// The standard templates every new project starts with: Character, Environment prop, and
// Level area (docs/engineering.md, Templates). Three kinds: character, prop, level_area.
// On a Blender part the four checks that block come first: texture names, scale, UV sets,
// triangle budget. The rest inform (docs/tasks/07-blender-first.md).
// POST /projects writes them for the project; the seed uses the same three.
import type { Template } from "@nkata/shared";

export type { Template };

export const CHARACTER_TEMPLATE: Template = {
  v: 1,
  name: "Character",
  kind: "character",
  parts: [
    { name: "concept", mapping: "file", checks: ["texture_size"] },
    { name: "face", mapping: "blend_collection", gate: [], checks: ["texture_names", "unit_scale", "uv_set_present", "triangle_budget", "name_pattern"], params: { triangle_budget: { max: 60000 }, name_pattern: { pattern: "SK_.*" }, texture_names: { pattern: "T_.*" } } },
    { name: "cloth", mapping: "blend_collection", gate: [], checks: ["texture_names", "unit_scale", "uv_set_present", "triangle_budget", "name_pattern"], params: { triangle_budget: { max: 30000 }, name_pattern: { pattern: "SK_.*" }, texture_names: { pattern: "T_.*" } } },
    { name: "hair", mapping: "blend_collection", gate: [], checks: ["texture_names", "unit_scale", "uv_set_present", "triangle_budget", "name_pattern"], params: { triangle_budget: { max: 30000 }, name_pattern: { pattern: "SK_.*" }, texture_names: { pattern: "T_.*" } } },
    { name: "textures", mapping: "file", gate: ["face", "cloth", "hair"], checks: ["texture_size", "name_pattern"], params: { name_pattern: { pattern: "T_.*" } } },
    { name: "rig", mapping: "blend_collection", gate: ["textures"], checks: ["rig_bone_names", "rig_bone_count", "metahuman_dna_present"] },
    { name: "lookdev", mapping: "ue_asset", gate: ["rig"], checks: ["texture_size"] },
  ],
  reference_slots: ["concept_sheet", "style_guide", "color_scheme"],
  export: { ue_path: "/Game/Characters/{asset}/{part}", name: "SK_{asset}_{part}" },
  blend_layout: "one_file_per_part",
};

export const PROP_TEMPLATE: Template = {
  v: 1,
  name: "Environment prop",
  kind: "prop",
  parts: [
    { name: "concept", mapping: "file", checks: ["texture_size"] },
    { name: "model", mapping: "blend_collection", gate: [], checks: ["texture_names", "unit_scale", "uv_set_present", "triangle_budget", "name_pattern", "pivot_at_base"], params: { triangle_budget: { max: 15000 }, name_pattern: { pattern: "SM_.*" }, texture_names: { pattern: "T_.*" } } },
    { name: "uvs", mapping: "blend_collection", gate: [], checks: ["uv_set_present", "name_pattern"] },
    { name: "textures", mapping: "file", gate: [], checks: ["texture_size", "name_pattern"] },
    { name: "lods", mapping: "ue_asset", gate: [], checks: ["lod_count"], params: { lod_count: { min: 3 } } },
    { name: "collision", mapping: "ue_asset", gate: [], checks: ["collision_present"] },
  ],
  reference_slots: ["concept_sheet", "style_guide"],
  export: { ue_path: "/Game/Props/{asset}", name: "SM_{asset}" },
  blend_layout: "one_file_per_part",
};

export const LEVEL_AREA_TEMPLATE: Template = {
  v: 1,
  name: "Level area",
  kind: "level_area",
  parts: [
    { name: "blockout", mapping: "ue_area", gate: [], checks: ["unit_scale"] },
    { name: "layout", mapping: "ue_area", gate: [], checks: ["name_pattern"] },
    { name: "set_dressing", mapping: "ue_area", gate: [], checks: ["name_pattern"] },
    { name: "lighting", mapping: "ue_area", gate: [], checks: [] },
  ],
  reference_slots: ["concept_sheet", "layout_sketch"],
  export: { ue_path: "/Game/Levels/{asset}", name: "{asset}" },
  blend_layout: "one_file_per_asset",
};

// v8 (docs/tasks/v8-prompts.md, step 11): one asset is one .blend with one part. A save of a new
// file makes an Object or an Environment with the four checks; the triangle budget comes from
// the project's budgets, so the template carries no number.
const FOUR_CHECKS = ["texture_names", "unit_scale", "uv_set_present", "triangle_budget"];
export const OBJECT_TEMPLATE: Template = {
  v: 1,
  name: "Object",
  kind: "prop",
  // v8 step 21: the pivot sits at the base of a prop, said as a note. A studio raises it to block,
  // or sets grid or authored, in the template.
  parts: [{ name: "model", mapping: "blend_collection", gate: [], checks: [...FOUR_CHECKS, "pivot_at_base"], params: { texture_names: { pattern: "T_.*" }, pivot_at_base: { convention: "base" } }, severity: { pivot_at_base: "note" } }],
  reference_slots: [],
  export: { ue_path: "/Game/Objects/{asset}", name: "SM_{asset}" },
  blend_layout: "one_file_per_asset",
};
export const ENVIRONMENT_TEMPLATE: Template = {
  v: 1,
  name: "Environment",
  kind: "level_area",
  parts: [{ name: "model", mapping: "blend_collection", gate: [], checks: FOUR_CHECKS, params: { texture_names: { pattern: "T_.*" } } }],
  reference_slots: [],
  export: { ue_path: "/Game/Environments/{asset}", name: "{asset}" },
  blend_layout: "one_file_per_asset",
};

export const TEMPLATES: Template[] = [CHARACTER_TEMPLATE, PROP_TEMPLATE, LEVEL_AREA_TEMPLATE, OBJECT_TEMPLATE, ENVIRONMENT_TEMPLATE];


/** Where a template file lives in the project folder (docs/engineering.md, Templates). */
export function templateFilePath(name: string): string {
  return `.nkata/templates/${name}.json`;
}
