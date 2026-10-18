// The five nouns: Project, Asset, Version, Comment, Approved (a flag on a Version). Plus the
// people around them. No part, gate or state types (handoff/v8/CLAUDE_CODE_PROMPT_v8.md).

export type Role = "producer" | "artDirector" | "artist" | "viewer";

export interface Studio { id: string; name: string; training: boolean }

/** A studio the account belongs to, as the Switch studio dialog lists it. */
export interface StudioRef { id: string; name: string; role: Role; projects: number; current: boolean }

/** Triangle budgets per kind, and an optional texture size limit, per project (Decisions 12). */
export interface Budgets { prop: number; vehicle: number; character: number; environment: number; maxTexture: number | null }
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
export interface LocalProject { projectId: string; name: string; path: string; bytes: number; syncing: boolean }

export type Journey = "invited" | "joined" | "blender" | "inBlender";

export interface Member { person: Person; journey: Journey }

export type CheckKey = "textures" | "scale" | "uv" | "tris";

export interface Check {
  key: CheckKey;
  pass: boolean;
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
