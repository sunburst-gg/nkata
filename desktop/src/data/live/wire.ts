// The server's wire shapes and the pure mappings onto the v8 nouns (docs/tasks/v8-prompts.md,
// step 11). One asset is one part. Every function here is pure so wire.test.ts covers the
// mapping without a server. Routes: docs/engineering.md, Protocols.
import type { AssetKind, Budgets as BudgetsWire, PresenceEntry, UserRef } from "@nkata/shared";
import { DEFAULT_BUDGETS, type Asset, type Budgets, type Check, type Comment, type Facts, type Journey, type Member, type Mention, type Person, type Project, type Role, type StudioRef, type Version } from "../types";
import { SWATCHES } from "@/ui/stage/Swatches";
import { isLead } from "@/auth/permissions";

export type ServerRole = "artist" | "art_director" | "producer" | "viewer";

export interface AccountWire { token?: string; user: UserRef; email: string; studio_id: string | null; roles: ServerRole[]; studios: { id: string; name: string; roles: ServerRole[] }[] }
export interface MemberWire { user: UserRef; email: string; roles: ServerRole[] }
export interface ProjectWire { id: string; name: string; folder_name: string; created_at: string; budgets?: BudgetsWire; deleted_at?: string | null }
export interface AssetWire { id: string; name: string; template_id: string; state: string; updated_at: string; kind?: AssetKind; group?: string | null; budget?: number | null; folder?: string }
export interface PartWire { id: string; asset_id: string; name: string; owner: UserRef | null; owner_id: string | null; state: "locked" | "draft" | "ready" | "approved"; mapping: { kind: string; file?: string }; updated_at: string; lock: { holder: UserRef; granted_at: string } | null }
export interface ManifestCheckWire { key: "textures" | "scale" | "uv" | "tris"; pass: boolean; sentence: string; fix: string }
export interface ManifestWire { objects: { name: string; triangles: number; materials: string[]; hash: string; uv_sets?: string[] }[]; textures?: { name: string; width: number; height: number }[]; unit_scale?: number | null; asset_kind?: "object" | "environment"; checks?: ManifestCheckWire[] }
export interface VersionWire { id: string; part_id: string; author_id: string; published: boolean; note: string; note_engineering?: string; created_at: string; render_url?: string | null; model_url?: string | null; manifest?: ManifestWire | null }
export interface CheckWire { check_id: string; severity: "block" | "warn"; passed: boolean; auto_fixed: boolean; message: string }
export interface ReviewWire { id: string; part_id: string; version_id: string; reviewer_id: string; decision: "approve" | "send_back"; note: string; created_at: string }
export interface CommentWire { id: string; part_id: string; version_id: string; author: UserRef; body: string; kind: "pin" | "take_a_look"; point: number[]; created_at: string }
export interface EventWire { id: string; event: Record<string, unknown> & { kind: string; actor_id: string; at: string } }

/** The strongest of a member's roles, in the app's words. */
export function roleOf(roles: readonly string[]): Role {
  if (roles.includes("producer")) return "producer";
  if (roles.includes("art_director")) return "artDirector";
  if (roles.includes("artist")) return "artist";
  return "viewer";
}
export const SERVER_ROLE: Record<Role, ServerRole> = { producer: "producer", artDirector: "art_director", artist: "artist", viewer: "viewer" };

/** A person's color: one of the eight, stable per id. */
export function colorOf(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SWATCHES[h % SWATCHES.length]!;
}

export function personOf(u: UserRef, roles: readonly string[], email?: string): Person {
  const name = u.name.trim();
  const first = name.split(/\s+/)[0] ?? "";
  const p: Person = { id: u.id, first: first || (email?.split("@")[0] ?? ""), name, initial: (first || email || "?").charAt(0).toUpperCase(), color: colorOf(u.id), role: roleOf(roles) };
  return email ? { ...p, email } : p;
}

/** "Just now", "12 min ago", "3 h ago", "Yesterday", "4 days ago", "12 Oct". */
export function ago(iso: string, now: Date): string {
  const ms = now.getTime() - new Date(iso).getTime();
  if (ms < 60_000) return "Just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} h ago`;
  const days = Math.floor(ms / 86_400_000);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const d = new Date(iso);
  return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`;
}

export function budgetsOf(b: BudgetsWire | undefined): Budgets {
  if (!b) return DEFAULT_BUDGETS;
  return { prop: b.prop, vehicle: b.vehicle, character: b.character, environment: b.environment, maxTexture: b.max_texture };
}
export function budgetsWire(b: Budgets): BudgetsWire {
  return { prop: b.prop, vehicle: b.vehicle, character: b.character, environment: b.environment, max_texture: b.maxTexture };
}

/** The budget an asset draws on: its override, else the project number for its kind and group. */
export function budgetFor(b: Budgets, kind: "object" | "environment", group: string | null, override?: number | null): number {
  if (override) return override;
  if (kind === "environment") return b.environment;
  const g = (group ?? "").toLowerCase();
  if (g.startsWith("vehicle")) return b.vehicle;
  if (g.startsWith("character")) return b.character;
  return b.prop;
}

const fmt = (n: number) => n.toLocaleString("en-US");

/** Facts from the manifest the add-on writes. Triangles only until step 13 fills the rest. */
export function factsOf(m: ManifestWire | null | undefined): Facts | null {
  if (!m) return null;
  const tris = m.objects.reduce((n, o) => n + o.triangles, 0);
  const uv = new Set(m.objects.flatMap((o) => o.uv_sets ?? [])).size;
  return { tris, textures: (m.textures ?? []).length, scale: (m.unit_scale ?? 1).toFixed(2), uvSets: uv };
}

/**
 * The four checks. Triangles come from the manifest against the budget. The other three come
 * from the add-on's check results when it posted them; until then they read "Not checked yet",
 * pending, never a pass.
 */
export function checksOf(facts: Facts | null, results: readonly CheckWire[], budget: number, fromManifest?: readonly ManifestCheckWire[]): Check[] {
  // The add-on's own four lines (step 13) win: they carry the sentence and the fix the artist saw.
  if (fromManifest && fromManifest.length === 4) {
    return fromManifest.map((c) => (c.key === "tris" && facts
      ? { key: c.key, pass: facts.tris <= budget, sentence: facts.tris <= budget ? `${fmt(facts.tris)} triangles, within budget.` : `${fmt(facts.tris)} triangles. Budget is ${fmt(budget)}.`, fix: c.fix }
      : { key: c.key, pass: c.pass, sentence: c.sentence, fix: c.fix }));
  }
  const byId = new Map(results.map((r) => [r.check_id, r]));
  const from = (key: Check["key"], ids: string[], okSentence: string, fix: string): Check => {
    const r = ids.map((id) => byId.get(id)).find(Boolean);
    if (!r) return { key, pass: false, pending: true, sentence: "Not checked yet.", fix };
    return { key, pass: r.passed, sentence: r.passed ? okSentence : r.message, fix };
  };
  const tris: Check = facts
    ? { key: "tris", pass: facts.tris <= budget, sentence: facts.tris <= budget ? `${fmt(facts.tris)} triangles, within budget.` : `${fmt(facts.tris)} triangles. Budget is ${fmt(budget)}.`, fix: "Over budget. Decimate or split the mesh." }
    : { key: "tris", pass: false, pending: true, sentence: "Not checked yet.", fix: "Over budget. Decimate or split the mesh." };
  return [
    from("textures", ["texture_names"], "Textures named.", "Rename the images T_<asset>_<map>."),
    from("scale", ["unit_scale"], "Scale 1.", "Apply scale in Blender."),
    from("uv", ["uv_set_present"], "UVs present.", "Unwrap the mesh."),
    tris,
  ];
}

export interface VersionInput { v: VersionWire; checks: readonly CheckWire[]; reviews: readonly ReviewWire[]; partApproved: boolean }

export function versionOf({ v, checks, reviews, partApproved }: VersionInput, n: number, budget: number, now: Date): Version {
  const facts = factsOf(v.manifest);
  const decided = reviews.filter((r) => r.version_id === v.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return {
    n, note: v.note, noteEngineering: v.note_engineering ?? "", publishedAt: ago(v.created_at, now), ...(facts ? { facts } : {}),
    checks: checksOf(facts, checks, budget, v.manifest?.checks),
    approved: decided?.decision === "approve" || (partApproved && !decided),
    changesRequested: decided?.decision === "send_back",
    ...(v.model_url ? { glb: v.model_url } : {}), ...(v.render_url ? { render: v.render_url } : {}),
  };
}

export interface AssetInput {
  a: AssetWire; part: PartWire; versions: VersionInput[]; people: ReadonlyMap<string, Person>; online: readonly PresenceEntry[]; budgets: Budgets; now: Date;
  /** Comments whose text names me, for mentionsMe. */
  mentionsMe: boolean;
}

/** One asset is one .blend with one part. Live: the owner's heartbeat on this part within 60 s. */
export function assetOf({ a, part, versions, people, online, budgets, now, mentionsMe }: AssetInput): Asset {
  const kind: AssetKind = a.kind ?? "object";
  const group = a.group ?? (a.folder ? a.folder : null);
  const budget = budgetFor(budgets, kind, group, a.budget);
  const owner = people.get(part.owner_id ?? "") ?? personOf(part.owner ?? { id: "", name: "", avatar_url: null }, ["artist"]);
  const beat = online.find((o) => o.part_id === part.id && now.getTime() - new Date(o.last_seen).getTime() < 60_000);
  const sorted = [...versions].sort((x, y) => y.v.created_at.localeCompare(x.v.created_at));
  const latest = sorted[0];
  const shown = sorted.filter((x) => x.v.published);
  // Published Versions count up from v1; an unpublished newest save is the Live one, which keeps no number.
  const list = shown.map((x, i) => versionOf(x, shown.length - i, budget, now));
  const live = !!beat || (!!latest && !latest.v.published);
  const liveVersion = latest && !latest.v.published ? versionOf(latest, (list[0]?.n ?? 0) + 1, budget, now) : null;
  const render = sorted.map((x) => x.v.render_url).find((u): u is string => !!u);
  const glb = sorted.map((x) => x.v.model_url).find((u): u is string => !!u);
  const changedAt = latest ? latest.v.created_at : part.updated_at;
  const asset: Asset = {
    id: a.id, name: a.name, kind, group, owner, versions: liveVersion ? [liveVersion, ...list] : list,
    changedAt: ago(changedAt, now), today: now.getTime() - new Date(changedAt).getTime() < 86_400_000,
    ...(glb ? { glb } : {}), ...(render ? { render } : {}), ...(live ? { live: { savedAt: ago(changedAt, now) } } : {}), ...(mentionsMe ? { mentionsMe: true } : {}), ...(a.budget ? { budget: a.budget } : {}),
  };
  return asset;
}

/**
 * The strip: invited until the person answers the name question; joined once named; blender
 * once this project has ever seen their heartbeat; in Blender while one is fresh.
 */
export function journeyOf(m: MemberWire, online: readonly PresenceEntry[], everSeen: ReadonlySet<string>, now: Date): Journey {
  const beat = online.find((o) => o.user.id === m.user.id);
  if (beat && beat.part_id && now.getTime() - new Date(beat.last_seen).getTime() < 60_000) return "inBlender";
  if (beat || everSeen.has(m.user.id)) return "blender";
  if (m.user.name.trim()) return "joined";
  return "invited";
}

export function memberOf(m: MemberWire, online: readonly PresenceEntry[], everSeen: ReadonlySet<string>, now: Date): Member {
  return { person: personOf(m.user, m.roles, m.email), journey: journeyOf(m, online, everSeen, now) };
}

export function commentOf(c: CommentWire, assetId: string, versionN: number, people: ReadonlyMap<string, Person>, now: Date): Comment {
  const author = people.get(c.author.id) ?? personOf(c.author, ["viewer"]);
  const pin = c.point.length === 3 && c.point.some((x) => x !== 0) ? { pin: [c.point[0]!, c.point[1]!, c.point[2]!] as [number, number, number] } : {};
  return { id: c.id, assetId, version: versionN, author, text: c.body, at: ago(c.created_at, now), ...pin };
}

/** Does a comment name this person? First name, whole word, any case. */
export function namesMe(text: string, me: Person): boolean {
  if (!me.first) return false;
  return new RegExp(`\\b${me.first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);
}

/** Mentions: comments that name me, and for a lead, published Versions waiting for a decision. */
export function mentionsOf(assets: readonly Asset[], comments: readonly Comment[], me: Person): Mention[] {
  const out: Mention[] = [];
  const spots: [string, string][] = [["58%", "40%"], ["40%", "55%"], ["62%", "36%"]];
  for (const c of comments) {
    if (c.author.id === me.id || !namesMe(c.text, me)) continue;
    const asset = assets.find((a) => a.id === c.assetId);
    if (!asset) continue;
    const [px, py] = spots[out.length % 3]!;
    out.push({ id: `m-${c.id}`, asset, who: c.author, verb: "pinned on", text: c.text, when: c.at, px, py });
  }
  if (isLead(me.role)) {
    for (const a of assets) {
      const v = a.versions[0];
      if (!v || !v.note || v.approved || v.changesRequested || a.live) continue;
      const [px, py] = spots[out.length % 3]!;
      out.push({ id: `m-${a.id}-v${v.n}`, asset: a, who: a.owner, verb: "published, for you to approve", text: v.note, when: v.publishedAt, px, py });
    }
  }
  return out.slice(0, 6);
}

export function projectOf(p: ProjectWire): Project {
  return { id: p.id, name: p.name, color: colorOf(p.id) };
}

export function studioRefsOf(acc: AccountWire): StudioRef[] {
  return acc.studios.map((s) => ({ id: s.id, name: s.name, role: roleOf(s.roles), projects: 0, current: s.id === acc.studio_id }));
}
