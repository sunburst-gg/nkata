// The five nouns: Project, Asset, Version, Comment, Approved (a flag on a Version). Plus the
// people around them. No part, gate or state types (docs/tasks/v8-prompts.md, Decisions).

export type Role = "producer" | "artDirector" | "artist" | "viewer";

export interface Studio { id: string; name: string; training: boolean }

/** A studio the account belongs to, as the Switch studio dialog lists it. */
export interface StudioRef { id: string; name: string; role: Role; projects: number; current: boolean }

/** Triangle budgets per kind, and an optional texture size limit, per project (Decisions 12). */
export interface Budgets { prop: number; vehicle: number; character: number; environment: number; maxTexture: number | null; /** v8 step 18: Nanite above this many triangles in Unreal. Absent means 500,000. */ nanite?: number }
export const DEFAULT_BUDGETS: Budgets = { prop: 30_000, vehicle: 60_000, character: 80_000, environment: 2_000_000, maxTexture: null };

export interface DeletedProject { id: string; name: string; deletedAt: string }

export interface Project {
  id: string;
  name: string;
  /** A CSS color, one of the eight swatches. The stage tints toward it. */
  color: string;
  /** The Try Nkata sample, read only. */
  sample?: boolean;
}

export interface Person {
  id: string;
  first: string;
  name: string;
  initial: string;
  /** A CSS color: one of the eight person colors. */
  color: string;
  role: Role;
  /** A line under the name where the prototype shows one, such as Tech artist. */
  title?: string;
  /** The address an invite went to, before the person signed in. */
  email?: string;
}

/** A Blender on this computer, as detection lists it. */
export interface BlenderInstall { path: string; version: string }

/** A project's files on this computer (artists). */
export interface LocalProject { projectId: string; name: string; path: string; bytes: number; syncing: boolean; /** What stops the sync, in the agent's words (a full disk). */ problem?: string }

export type Journey = "invited" | "joined" | "blender" | "inBlender";

export interface Member { person: Person; journey: Journey }

export type CheckKey = "textures" | "scale" | "uv" | "tris" | "pivot";

/** How strict the studio set a check (v8 step 21): only a failing block holds Publish. */
export type CheckLevel = "block" | "warn" | "note";

/** Where the pivot belongs for a kind of asset: the base, a grid corner, or wherever it was modelled. */
export type PivotRule = "base" | "grid" | "authored";

/** One of a kind's rules, as Project settings shows it (v8 step 21). Off: the template does not run it. */
export interface Rule { key: CheckKey; level: CheckLevel | "off"; pivot?: PivotRule; gridM?: number }

export interface Check {
  key: CheckKey;
  pass: boolean;
  /** The template's level. Absent means block. */
  level?: CheckLevel;
  /** A lead accepted this failing check: who, why, when. It no longer holds Publish. */
  accepted?: { by: string; reason: string; at: string };
  /** The plain sentence the person reads. */
  sentence: string;
  /** The one-line fix, shown under a failed check. */
  fix: string;
  /** Not checked yet: the add-on has not reported this one. Never drawn as a pass. */
  pending?: boolean;
}

export interface Facts {
  tris: number;
  /** Texture count, named to the sheet. */
  textures: number;
  scale: string;
  uvSets: number;
  /** v8 step 17: the rig's bone count, when the asset has one. */
  bones?: number;
  /** v8 step 17: the animations in the export, when there are any. */
  animations?: { name: string; seconds: number }[];
  /** v8 step 17: the export read back in Blender: intact, or one line per loss in the add-on's words. */
  export?: { intact: boolean; lines: string[] };
}

export interface Version {
  n: number;
  /** The one-line note written on Publish. Empty on a save that was never published. */
  note: string;
  noteEngineering?: string;
  /** When it was published, as the app shows it: "2 min ago", "Yesterday". */
  publishedAt: string;
  /** The machine-filled card. Absent on a Version from before the add-on wrote one. */
  facts?: Facts;
  checks: Check[];
  approved: boolean;
  changesRequested: boolean;
  /** This save's own model and still, when the agent uploaded them. The mock has one model per asset. */
  glb?: string;
  render?: string;
  /** Where this save is in Unreal when the mirror is on: on its way, in the editor, or did not arrive. */
  unreal?: "pending" | "synced" | "failed";
}

export type AssetKind = "object" | "environment";

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  /** The first subfolder under the project, or null at the root. Sections on the wall. */
  group: string | null;
  owner: Person;
  /** The model, for objects. A path the viewer loads. */
  glb?: string;
  /** The render, for environments. A path for an <img> or a background. */
  render?: string;
  /** The latest save, not handed off. */
  live?: { savedAt: string };
  /** Newest first. versions[0] is the current Version. */
  versions: Version[];
  /** Someone mentioned me on it. */
  mentionsMe?: boolean;
  /**
   * Pins to address (v8 step 14): on the current Version, plus the ones still open from the
   * Version before when that one was sent back, which carry onto this one. `from` names that
   * Version when any carried.
   */
  pins?: { open: number; total: number; from?: number };
  /** The .blend, project relative, when the server knows it. The header shows its name. */
  file?: string;
  /** A lead's override of the project budget for this asset alone. */
  budget?: number;
  /** When it last changed, as the app shows it. */
  changedAt: string;
  /** Changed today: cards from before today read slightly desaturated. */
  today: boolean;
}

export interface Comment {
  id: string;
  assetId: string;
  version: number | "live";
  author: Person;
  text: string;
  pin?: [number, number, number];
  at: string;
  /** A pin marked done (v8 step 14). It draws hollow and sits under Addressed. */
  done?: boolean;
}

export interface Mention {
  id: string;
  asset: Asset;
  who: Person;
  verb: string;
  text: string;
  when: string;
  /** Where the pin sits on the still, as percentages. */
  px: string;
  py: string;
}
