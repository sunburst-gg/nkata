// Pure selectors for what the prototype's renderVals() computes. They take data and UI state and
// return what a screen shows; no component works it out on its own. Ported line by line from the
// Component class of the v8 prototype (removed after step 13; its words per combo are in
// docs/v8-shots/proto-words.json) so the tests can hold them to it.
import { can, isArtist, isLead, isViewer } from "@/auth/permissions";
import { isApproved, needsMe, sentBackWithOpenPins, waitingOnLead } from "@/data/rules";
import type { Asset, Comment, Facts, Member, Person, Version } from "@/data/types";
import type { Stage } from "@/data/mock";

export type Filter = "Everything" | "Mine" | "Needs my eyes" | "Approved";

/** The line under a sent back asset: "2 of 3 pins open", or null once every pin is done (v8 step 14). */
export function openPinsLine(asset: Asset): string | null {
  if (!sentBackWithOpenPins(asset) || !asset.pins) return null;
  const { open, total } = asset.pins;
  return `${open} of ${total} pin${total === 1 ? "" : "s"} open`;
}

/** Who may mark a pin done or reopen it: its author, the asset's owner, or a lead (v8 step 14). */
export function canResolve(asset: Asset, comment: Comment, me: Person): boolean {
  return !!comment.pin && (comment.author.id === me.id || asset.owner.id === me.id || isLead(me.role));
}

/**
 * What the stage loads for a stop: that Version's own model and still when the agent uploaded
 * them, else the asset's newest. Live is the newest save, versions[0]. Picking a Version in the
 * row changes the model on the stage, not only the card beside it.
 */
export function modelOf(asset: Asset, shown: number | "live"): { glb?: string; render?: string } {
  const version = shown === "live" ? asset.versions[0] : asset.versions.find((v) => v.n === shown);
  const glb = version?.glb ?? asset.glb;
  const render = version?.render ?? asset.render;
  return { ...(glb ? { glb } : {}), ...(render ? { render } : {}) };
}

/** Saved first: a card that just saved moves to the top. */
export function cardOrder(assets: readonly Asset[], saved: Readonly<Record<string, number>>): Asset[] {
  return assets.slice().sort((a, b) => (saved[b.id] ? 1 : 0) - (saved[a.id] ? 1 : 0));
}

export function applyFilter(assets: readonly Asset[], me: Person, filter: Filter, group: string): Asset[] {
  const mine = needsMe(assets, me);
  return assets.filter((a) => (filter === "Everything" || (filter === "Mine" && a.owner.id === me.id) || (filter === "Needs my eyes" && mine.includes(a)) || (filter === "Approved" && isApproved(a))) && (group === "All" || a.group === group));
}

export interface FilterChip { name: Filter; count: number; hasCount: boolean }

/** The chips with their counts. Viewers have no Mine. */
export function filterCounts(assets: readonly Asset[], me: Person): FilterChip[] {
  const mine = needsMe(assets, me);
  const rows: [Filter, number][] = [["Everything", assets.length], ["Mine", assets.filter((a) => a.owner.id === me.id).length], ["Needs my eyes", mine.length], ["Approved", assets.filter(isApproved).length]];
  return rows.filter(([n]) => !(n === "Mine" && !can("seeMine", me.role))).map(([name, count]) => ({ name, count, hasCount: name !== "Everything" && count > 0 }));
}

export interface Section { name: string; titled: boolean; assets: Asset[] }

/** Sections per group. No headers when there is only one group. */
export function sectionsByGroup(all: readonly Asset[], shown: readonly Asset[]): Section[] {
  const groups = [...new Set(all.map((a) => a.group ?? ""))];
  if (groups.length <= 1) return [{ name: "", titled: false, assets: [...shown] }];
  return [...new Set(shown.map((a) => a.group ?? ""))].map((g) => ({ name: g, titled: true, assets: shown.filter((a) => (a.group ?? "") === g) }));
}

export type StripLabel = "You" | "Lead" | "Looking" | "Invited" | "Joined" | "Blender" | "In Blender";
const JOURNEY_WORD: Record<Member["journey"], StripLabel> = { invited: "Invited", joined: "Joined", blender: "Blender", inBlender: "In Blender" };

/** The label under a face in the team strip. */
export function stripLabel(m: Member, me: Person): StripLabel {
  if (m.person.id === me.id) return "You";
  if (isViewer(m.person.role)) return "Looking";
  if (isLead(m.person.role)) return "Lead";
  return JOURNEY_WORD[m.journey];
}

export interface Journey { steps: [boolean, boolean, boolean]; done: number; open: boolean; nextAction: string }

/** The progress ring and the next action. Leads: invited, someone joined, first save. Artists: joined, set up, own save. */
export function journey(assets: readonly Asset[], members: readonly Member[], me: Person, stage: Stage): Journey {
  const lead = isLead(me.role);
  const labels = members.map((m) => stripLabel(m, me));
  const leadSteps: [boolean, boolean, boolean] = [assets.length > 0 || members.length > 1, labels.some((l) => l === "Joined" || l === "Blender" || l === "In Blender"), assets.length > 0];
  const artistSteps: [boolean, boolean, boolean] = [true, stage !== "arrival", assets.some((a) => a.owner.id === me.id)];
  const steps = lead ? leadSteps : isArtist(me.role) ? artistSteps : [true, true, true] as [boolean, boolean, boolean];
  const done = steps.filter(Boolean).length;
  const open = done < 3 && stage !== "studio" && can("seeJourney", me.role);
  const pending = members.filter((m) => m.journey === "invited" && isArtist(m.person.role));
  const adaIn = members.some((m) => m.person.id === "A" && (m.journey === "inBlender" || m.journey === "blender"));
  const waiting = pending.length === 1 ? `Waiting for ${pending[0]!.person.first} to join` : pending.length > 1 ? `Waiting for ${pending.length} people to join` : "Waiting for Ada to join";
  const nextAction = lead ? (!steps[0] ? "Invite your artists" : !steps[1] && !adaIn ? waiting : "Waiting for the first save") : "Open Blender and save";
  return { steps, done, open, nextAction };
}

export interface FactRow { name: string; value: string; delta: string; tone: "muted" | "neutral" | "good"; failed: boolean; fix: string; pending?: boolean }

const fmt = (n: number): string => n.toLocaleString("en-US");

/** The delta of a triangle count against the Version before. More is neutral, fewer is green (Decisions 9). */
export function trisDelta(now: number, prev: number | null | undefined): { text: string; tone: "muted" | "neutral" | "good" } {
  if (prev == null) return { text: "first Version", tone: "muted" };
  if (now === prev) return { text: "same", tone: "muted" };
  const k = (Math.abs(now - prev) / 1000).toFixed(1).replace(/\.0$/, "");
  return now > prev ? { text: `+${k}k tris`, tone: "neutral" } : { text: `−${k}k tris`, tone: "good" };
}

/** The four facts with their deltas and, under a failed one, the fix. Every fact appears once. */
export function factsWithDeltas(facts: Facts | undefined, previous: Facts | undefined, checks: Version["checks"]): FactRow[] {
  if (!facts) return [];
  const check = (key: Version["checks"][number]["key"]) => checks.find((c) => c.key === key);
  const d = trisDelta(facts.tris, previous?.tris);
  const rows: FactRow[] = [
    { name: "Triangles", value: fmt(facts.tris), delta: d.text, tone: d.tone, failed: !check("tris")?.pass && !check("tris")?.pending, pending: !!check("tris")?.pending, fix: check("tris")?.fix ?? "" },
    { name: "Textures", value: `${facts.textures} named to the sheet`, delta: previous ? "same" : "new", tone: "muted", failed: !check("textures")?.pass && !check("textures")?.pending, pending: !!check("textures")?.pending, fix: check("textures")?.fix ?? "" },
    { name: "Scale", value: facts.scale, delta: "metres", tone: "muted", failed: !check("scale")?.pass && !check("scale")?.pending, pending: !!check("scale")?.pending, fix: check("scale")?.fix ?? "" },
    { name: "UV sets", value: String(facts.uvSets), delta: "same", tone: "muted", failed: !check("uv")?.pass && !check("uv")?.pending, pending: !!check("uv")?.pending, fix: check("uv")?.fix ?? "" },
  ];
  return rows;
}

/** A lead can decide on a published Version that has no decision yet. Never on Live. */
export function canReview(asset: Asset, version: number | "live"): boolean {
  if (version === "live") return false;
  const v = asset.versions.find((x) => x.n === version);
  return !!v && !!v.note && !v.approved;
}

/** Publish needs four green checks and a note. The label says which is missing. */
export function publishState(asset: Asset, note: string): { can: boolean; label: string; allGreen: boolean; noteOk: boolean } {
  const v = asset.versions[0];
  const allGreen = !v || v.checks.every((c) => c.pass);
  const noteOk = note.trim().length > 0;
  const next = (v?.n ?? 0) + 1;
  return { can: allGreen && noteOk, allGreen, noteOk, label: !allGreen ? "Publish, after the red one" : !noteOk ? "Publish, after the note" : `Publish v${next}` };
}

export { needsMe, waitingOnLead, isApproved };
