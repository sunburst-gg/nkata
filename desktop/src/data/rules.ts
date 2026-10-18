// Rules both the mock and the screens apply, so the wall, the counts and Mentions agree.
import type { Asset, Person, Version } from "./types";

export const slug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The current Version, or null before the first publish. */
export const current = (a: Asset): Version | null => a.versions[0] ?? null;

/** Published and waiting on a lead: the current Version has a note and no decision yet. */
export const waitingOnLead = (a: Asset): boolean => {
  const v = current(a);
  return !!v && !!v.note && !v.approved && !v.changesRequested && !a.live;
};

export const isApproved = (a: Asset): boolean => !!current(a)?.approved;

/** What needs my eyes: for a lead, what waits on them or mentions them; for others, mentions. */
export function needsMe(assets: readonly Asset[], me: Person): Asset[] {
  const lead = me.role === "producer" || me.role === "artDirector";
  return assets.filter((a) => (lead ? waitingOnLead(a) || !!a.mentionsMe : !!a.mentionsMe));
}
