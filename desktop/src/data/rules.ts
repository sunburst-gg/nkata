// Rules both the mock and the screens apply, so the wall, the counts and Mentions agree.
import { isLead } from "@/auth/permissions";
import type { Asset, Check, Comment, Person, Version } from "./types";

export const slug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** A failing check at block level that nobody accepted: the only kind that holds Publish (v8 step 21). */
export const holds = (c: Check): boolean => !c.pass && !c.pending && (c.level ?? "block") === "block" && !c.accepted;

/** The check behind each line, as the server and the add-on name it. */
export const CHECK_ID: Record<Check["key"], string> = { textures: "texture_names", scale: "unit_scale", uv: "uv_set_present", tris: "triangle_budget", pivot: "pivot_at_base", unreal: "unreal_validators" };

/** The current Version, or null before the first publish. */
export const current = (a: Asset): Version | null => a.versions[0] ?? null;

/** Published and waiting on a lead: the current Version has a note and no decision yet. */
export const waitingOnLead = (a: Asset): boolean => {
  const v = current(a);
  return !!v && !!v.note && !v.approved && !v.changesRequested && !a.live;
};

export const isApproved = (a: Asset): boolean => !!current(a)?.approved;

/**
 * Pins to address on the current Version (v8 step 14): its own, plus the open ones carried from
 * the Version before when that one was sent back. Undefined when there are none.
 */
export function pinsOn(comments: readonly Comment[], versions: readonly Version[]): { open: number; total: number; from?: number } | undefined {
  const [cur, prev] = versions;
  if (!cur) return undefined;
  const own = comments.filter((c) => c.pin && c.version === cur.n);
  const carriedOpen = prev?.changesRequested ? comments.filter((c) => c.pin && c.version === prev.n && !c.done) : [];
  const total = own.length + carriedOpen.length;
  if (!total) return undefined;
  return { open: own.filter((c) => !c.done).length + carriedOpen.length, total, ...(carriedOpen.length ? { from: prev!.n } : {}) };
}

/** Sent back with pins still open on the current Version: the artist's turn (v8 step 14). */
export const sentBackWithOpenPins = (a: Asset): boolean => !!current(a)?.changesRequested && (a.pins?.open ?? 0) > 0;

/**
 * What needs my eyes: for a lead, what waits on them or mentions them; for an artist, what
 * mentions them; for anyone, their own assets sent back with open pins (a lead can own assets);
 * for a viewer, mentions.
 */
export function needsMe(assets: readonly Asset[], me: Person): Asset[] {
  const lead = isLead(me.role);
  return assets.filter((a) => (lead && waitingOnLead(a)) || !!a.mentionsMe || (a.owner.id === me.id && sentBackWithOpenPins(a)));
}
