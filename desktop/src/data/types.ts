// The app's view of the product model. Mirrors docs/engineering.md, Data model, in the shape
// the screens need. The real backend replaces src/data/mock.ts behind DataSource.
import type { Role } from "@/auth/permissions";

export type RenderKey = "ground" | "overview" | "interior" | "courtyard" | "tree";

export type AvatarTone = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type Presence = "online" | "idle" | "offline";

export interface Person {
  id: string;
  name: string;
  initial: string;
  tone: AvatarTone;
  title: string;
  role: Role;
  email: string;
  presence: Presence;
  /** Where they are right now, in the product's words. */
  where: string;
  /** Mono label: "now", "2 h", "1 d". */
  seen: string;
}

export type PartState = "draft" | "ready" | "approved" | "locked" | "waiting";
export type AssetState = "draft" | "ready" | "approved" | "locked" | "failed";
export type MirrorState = "synced" | "syncing" | "failed" | "offline";
export type CheckStatus = "pass" | "fail" | "warn" | "running" | "waiting";
export type AssetKind = "Characters" | "Props" | "Levels";

/** A render: one of the bundled compound crops (the mock), or the version's capture by URL. */
export type Render = { key: RenderKey; pos: string; url?: undefined } | { url: string; key?: undefined; pos?: undefined };

/** What the add-on wrote next to the export: enough to say what changed between two versions. */
export interface VersionManifest {
  objects: { name: string; triangles: number; materials: string[]; hash: string; uvSets: string[] }[];
  bones: number | null;
  /** The images the part's materials use, by name. Empty on manifests from before step 7. */
  textures: { name: string; width: number; height: number }[];
  /** The scene's unit scale at export. Null on manifests from before step 7. */
  unitScale: number | null;
}

export interface Version {
  id: string;
  n: number;
  /** The publish note. Empty on a save that was never published. */
  note: string;
  /** Details for engineers, optional. */
  noteEngineering?: string;
  published?: boolean;
  /** The published render, or null before a render exists. */
  render: Render | null;
  authorId: string;
  when: string;
  mirror: "synced" | "failed";
  /** Set when this version was made by Roll back. */
  from?: number;
  /** The GLB of this version: the add-on's export, or the area export from Unreal. */
  model?: string;
  /** The FBX exported on Publish, named for the engine. */
  fbx?: string;
  manifest?: VersionManifest;
}

export interface Check {
  id: string;
  name: string;
  detail: string;
  status: CheckStatus;
  /** Failing and blocking right now. */
  blocks: boolean;
  /** The template's severity: a blocking check is one of the four dots. */
  severity: "block" | "warn";
  fixable: boolean;
  /** After a fix. */
  fixedDetail?: string;
}

export interface Comment {
  id: string;
  n: number;
  authorId: string;
  partName: string;
  when: string;
  text: string;
  resolved: boolean;
  /** pin: a note at a point. take_a_look: asks the art director to look, no state change. */
  kind: CommentKind;
  source: "UE5" | "Blender" | "Nkata";
  /** The point on the mesh the comment is pinned to, in the model's space. Absent: a thread reply. */
  pos?: [number, number, number];
}

export interface Part {
  id: string;
  name: string;
  state: PartState;
  ownerId: string;
  render: Render | null;
  lock: { holderId: string; since: string } | null;
  gate: string[];
  versions: Version[];
  checks: Check[];
  comments: Comment[];
  mirror: { state: MirrorState; seconds: number };
  /** Where a prop is placed after its last mirror: levels and actor counts. */
  refs: { level: string; actors: number }[];
  /** The .blend this part lives in, project-relative. Null for parts outside Blender. */
  file: string | null;
  /** The file name the engine expects, from the template: SM_Market_stall, SK_Ojukwu_face. */
  exportName: string;
}

export interface Asset {
  id: string;
  slug: string;
  /** The project this asset belongs to. */
  projectSlug: string;
  name: string;
  kind: AssetKind;
  state: AssetState;
  render: Render | null;
  /** Shown on a tile with no render. */
  noRenderText?: string;
  meta: string;
  ownerId: string;
  /** People in it now. */
  present: string[];
  parts: Part[];
  template: string;
  usedIn: string[];
  changedOrder: number;
  /** "4 s ago", "Yesterday". The tile's right-hand word. */
  when: string;
  /** The last mirror did not reach Unreal. An amber dot on the tile. */
  syncIssue?: boolean;
  /** The GLB the Blender add-on exported for the latest version. Absent: the poster only. */
  model?: string;
  /** Who holds the rights, confirmed by a reviewer. Required to Publish while the studio trains. */
  rights: { statement: string; confirmedById: string } | null;
}

export interface ActivityItem {
  id: string;
  personId: string;
  text: string;
  target: string;
  when: string;
  dot: AssetState | "synced" | "muted";
  assetSlug: string;
  partName?: string;
}

export interface TemplatePart {
  id: string;
  name: string;
  gate: string[];
  checks: string[];
  refs: number;
}

export interface Template {
  id: string;
  name: string;
  /** Which editor the parts live in. A level area has no Blender part to start from a file. */
  kind: "character" | "prop" | "level_area";
  parts: TemplatePart[];
  usedBy: number;
  tools: string;
}

export interface Project {
  id: string;
  slug: string;
  name: string;
  /** The square beside the name. An avatar tone, never a hex in components. */
  tone: AvatarTone;
  /** "Created 10 Oct 2026". */
  createdLabel: string;
  ownerId: string;
  assetCount: number;
  changed: string;
  renders: RenderKey[];
  present: string[];
  folder: string;
  blender: string;
  unreal: string;
  inviteLink: string;
  sizeLabel: string;
}

export type Training = "on" | "off";

export interface Studio {
  id: string;
  name: string;
  initial: string;
  peopleCount: number;
  projects: Project[];
  /** On: the studio contributes to model training and pays nothing. Off: billed per seat. */
  training: Training;
  /** The billing line and the seat count. No payment code yet. */
  billing: { line: string; seats: number };
}

export type CommentKind = "pin" | "take_a_look";

export type ConnectionId = "blender" | "unreal" | "discord" | "linear" | "substance" | "maya" | "houdini" | "unity" | "godot";

export interface Connection {
  id: ConnectionId;
  name: string;
  /** One line under the name: what was found, or what it does. */
  line: string;
  soon: boolean;
  connected: boolean;
  /** Found on this computer: the version, for the New project pre-fill. */
  version?: string;
}

/** A comment that names the signed-in person. */
export interface Mention {
  id: string;
  authorId: string;
  on: string;
  assetSlug: string;
  partName?: string;
  when: string;
  text: string;
}

export interface TrainingEntry {
  when: string;
  text: string;
}

export interface AskAnswer {
  answer: string;
  note: string;
  link: { label: string; assetSlug: string; partName?: string } | null;
}

/** What the mock holds for each demo stage of the first run. */
export type DemoStage = "fresh" | "connected" | "firstAsset" | "populated";

export interface DigestRenderPair {
  assetSlug: string;
  name: string;
  note: string;
  before: Render;
  after: Render;
  beforeLabel: string;
  afterLabel: string;
}

export interface DigestMove {
  assetSlug: string;
  name: string;
  from: AssetState;
  to: AssetState;
  when: string;
  render: Render | null;
}

export interface Digest {
  weekLabel: string;
  changed: number;
  moved: number;
  notes: number;
  renderPairs: DigestRenderPair[];
  moves: DigestMove[];
  weekNotes: { personId: string; on: string; when: string; text: string }[];
  hasPrevious: boolean;
  hasNext: boolean;
}

/** One of the account's studios, for Switch studio. */
export interface StudioRef {
  id: string;
  name: string;
  roles: Role[];
}

export interface Session {
  user: Person;
  studio: Studio;
  /** Every studio the account belongs to. Empty before the first one is created. */
  studios: StudioRef[];
  theme: "dark" | "light";
  digestHome: boolean;
  /** What the server has switched on. Unreal is Coming soon in v1 (UNREAL_ENABLED). */
  features: { unreal: boolean };
}

export interface Snapshot {
  session: Session;
  people: Person[];
  assets: Asset[];
  activity: ActivityItem[];
  templates: Template[];
  digests: Digest[];
  digestIndex: number;
  connections: Connection[];
  mentions: Mention[];
  trainingLog: TrainingEntry[];
  online: number;
  changedToday: number;
  changedThisWeek: number;
}

/** What the screens call. The mock implements it in memory; the server client replaces it. */
export interface DataSource {
  snapshot(): Snapshot;
  subscribe(fn: () => void): () => void;
  signIn(as: "artist" | "viewer"): void;
  signOut(): void;
  markReady(assetSlug: string, partName: string): { ok: true } | { ok: false; reason: string };
  fixChecks(assetSlug: string, partName: string): { ok: true } | { ok: false; reason: string };
  rollBack(assetSlug: string, partName: string, toVersion: number): Version;
  removeGate(assetSlug: string, partName: string): void;
  /** Confirms who holds the rights to an asset, in one line. An art director or producer only. */
  confirmRights(assetSlug: string, statement: string): Promise<void> | void;
  /** Who owns a part. Null clears it. An art director or producer only. */
  assignOwner(assetSlug: string, partName: string, personId: string | null): Promise<void> | void;
  addComment(assetSlug: string, partName: string, text: string, pos?: [number, number, number]): Comment;
  /** Invite to the studio, or through a project with a note: the project invite email carries it. */
  invite(email: string, role: Role, options?: { projectSlug?: string; note?: string }): void;
  /** The signed-in person's name and email, from the Name screen and Settings, Account. */
  setMe(name: string, email: string): void;
  /** Creates a studio: its name and the training setting. The account becomes its producer and moves into it. */
  createStudio(name: string, training: Training): Promise<void> | void;
  /** Moves the session into another of the account's studios. */
  switchStudio(id: string): Promise<void> | void;
  setStudioName(name: string): void;
  setTraining(training: Training): Promise<void> | void;
  createProject(input: { name: string; folder: string; blender: string; unreal: string }): Promise<Project> | Project;
  renameProject(slug: string, name: string): void;
  deleteProject(slug: string): void;
  setMemberRole(personId: string, role: Role): void;
  removeMember(personId: string): void;
  /** Connect a tool: installs the add-on or plugin, or the Discord hook. */
  connect(id: ConnectionId): Promise<void> | void;
  /** Creates an asset from a template: every part, or one (the default for a prop). With `file`, the
   * one Blender part lives in that existing .blend from the project folder instead of a new one. */
  createAsset(projectSlug: string, name: string, template: string, parts: "all" | "one", options?: { file?: string }): Promise<Asset> | Asset;
  /** The .blend files in the project folder that no part lives in yet. Empty outside the desktop app. */
  freeBlendFiles(): Promise<string[]>;
  /** Cmd K. One question, one answer with the gate, the owner, the last comment, and a link. */
  ask(question: string): AskAnswer;
  setDigestIndex(i: number): void;
  setDigestHome(on: boolean): void;
  setTheme(theme: "dark" | "light"): void;
  /** Server only: the project's Discord webhook. Absent on the mock. */
  setDiscordWebhook?(url: string | null): Promise<void>;
  /** Server only: the export manifest of one asset as JSON text. */
  exportAsset?(assetSlug: string): Promise<string>;
  /** Server only: projects deleted from this studio, oldest first, and the way back. */
  deletedProjects?(): Promise<{ id: string; name: string; deletedAt: string }[]>;
  restoreProject?(id: string): Promise<void>;
}
