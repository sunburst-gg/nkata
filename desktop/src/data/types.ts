// The app's view of the product model. Mirrors docs/engineering.md, Data model, in the shape
// the screens need. The real backend replaces src/data/mock.ts behind DataSource.
import type { Role } from "@/auth/permissions";

export type RenderKey = "ground" | "overview" | "interior" | "courtyard" | "tree";

export type AvatarTone = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

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

export interface Render {
  key: RenderKey;
  /** CSS background-position for the crop. */
  pos: string;
}

export interface Version {
  id: string;
  n: number;
  note: string;
  /** The published render, or null before a render exists. */
  render: Render | null;
  authorId: string;
  when: string;
  mirror: "synced" | "failed";
  /** Set when this version was made by Roll back. */
  from?: number;
}

export interface Check {
  id: string;
  name: string;
  detail: string;
  status: CheckStatus;
  blocks: boolean;
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
  /** Pin position on the preview in percent. */
  pin?: { x: number; y: number };
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
}

export interface Asset {
  id: string;
  slug: string;
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
  parts: TemplatePart[];
  usedBy: number;
  tools: string;
}

export interface Project {
  id: string;
  slug: string;
  name: string;
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

export interface Session {
  user: Person;
  studio: Studio;
  theme: "dark" | "light";
  digestHome: boolean;
}

export interface Snapshot {
  session: Session;
  people: Person[];
  assets: Asset[];
  activity: ActivityItem[];
  templates: Template[];
  digests: Digest[];
  digestIndex: number;
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
  addComment(assetSlug: string, partName: string, text: string): Comment;
  invite(email: string, role: Role): void;
  setDigestIndex(i: number): void;
  setDigestHome(on: boolean): void;
  setTheme(theme: "dark" | "light"): void;
  /** Server only: the project's Discord webhook. Absent on the mock. */
  setDiscordWebhook?(url: string | null): Promise<void>;
  /** Server only: the studio's training setting. Producers only. */
  setTraining?(training: Training): Promise<void>;
  /** Server only: the export manifest of one asset as JSON text. */
  exportAsset?(assetSlug: string): Promise<string>;
}
