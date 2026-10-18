// The board: every part in the project as one row, computed from what the app already loads.
// Owner, state, the blocking checks as dots, whose move it is, waiting since the last state
// change, the last note, published when. Nothing here is typed by anyone. Sort: waiting longest
// first. A server route takes over if a project outgrows this (docs/tasks/07-blender-first.md, 8).
import type { Asset, Check, Part, PartState } from "@/data/types";

/** Whose move a row is: the owner works on it, reviewers decide on it, a gate holds it, or it is done. */
export type Move = "owner" | "reviewers" | "gate" | "done";

export interface BoardRow {
  key: string;
  assetSlug: string;
  assetName: string;
  partName: string;
  template: string;
  folder: string;
  ownerId: string;
  state: PartState;
  /** The template's blocking checks, as the part last ran them. */
  dots: Check[];
  move: Move;
  /** Since the last state change, in milliseconds, or null when the source does not say. */
  waitingMs: number | null;
  /** The last publish note, or "" before the first publish. */
  lastNote: string;
  /** "12 min", "2 d": when the last version was published, or "" with no version. */
  publishedWhen: string;
}

export interface BoardCounts {
  inWork: number;
  waitingOnReview: number;
  approved: number;
}

export interface BoardFilter {
  owner: string | null;
  state: PartState | null;
  template: string | null;
  folder: string | null;
  /** Waiting on me: the signed in person and whether they review. Null: everyone's rows. */
  me: { id: string; reviews: boolean } | null;
}

export const EMPTY_FILTER: BoardFilter = { owner: null, state: null, template: null, folder: null, me: null };

export function moveOf(state: PartState): Move {
  switch (state) {
    case "draft":
    case "locked":
      return "owner";
    case "ready":
      return "reviewers";
    case "waiting":
      return "gate";
    case "approved":
      return "done";
  }
}

function rowOf(asset: Asset, part: Part, now: number): BoardRow {
  const since = part.stateSince ? new Date(part.stateSince).getTime() : Number.NaN;
  const published = part.versions.find((v) => v.published !== false && v.note);
  return {
    key: `${asset.slug}/${part.name}`,
    assetSlug: asset.slug,
    assetName: asset.name,
    partName: part.name,
    template: asset.template,
    folder: asset.folder,
    ownerId: part.ownerId,
    state: part.state,
    dots: part.checks.filter((c) => c.severity === "block"),
    move: moveOf(part.state),
    waitingMs: Number.isFinite(since) ? Math.max(0, now - since) : null,
    lastNote: published?.note ?? "",
    publishedWhen: published?.when ?? "",
  };
}

/** Every part as a row, waiting longest first. Rows the source cannot time come last, in list order. */
export function boardRows(assets: readonly Asset[], now: number = Date.now()): BoardRow[] {
  const rows = assets.flatMap((a) => a.parts.map((p) => rowOf(a, p, now)));
  return rows.sort((a, b) => {
    if (a.move === "done" && b.move !== "done") return 1;
    if (b.move === "done" && a.move !== "done") return -1;
    if (a.waitingMs === null && b.waitingMs === null) return 0;
    if (a.waitingMs === null) return 1;
    if (b.waitingMs === null) return -1;
    return b.waitingMs - a.waitingMs;
  });
}

/** The three numbers on top: owners working, reviewers deciding, done. Gated parts count as in work. */
export function boardCounts(rows: readonly BoardRow[]): BoardCounts {
  return {
    inWork: rows.filter((r) => r.move === "owner" || r.move === "gate").length,
    waitingOnReview: rows.filter((r) => r.move === "reviewers").length,
    approved: rows.filter((r) => r.move === "done").length,
  };
}

/** Waiting on me: my parts when it is the owner's move, and every Ready part when I review. */
export function isMyMove(row: BoardRow, me: { id: string; reviews: boolean }): boolean {
  if (row.move === "owner") return row.ownerId === me.id;
  if (row.move === "reviewers") return me.reviews;
  return false;
}

export function filterRows(rows: readonly BoardRow[], f: BoardFilter): BoardRow[] {
  return rows.filter((r) => {
    if (f.owner !== null && r.ownerId !== f.owner) return false;
    if (f.state !== null && r.state !== f.state) return false;
    if (f.template !== null && r.template !== f.template) return false;
    if (f.folder !== null && r.folder !== f.folder) return false;
    if (f.me !== null && !isMyMove(r, f.me)) return false;
    return true;
  });
}

/** "4 min", "3 h", "2 d". Under a minute reads "now". */
export function waitingLabel(ms: number | null): string {
  if (ms === null) return "";
  if (ms < 60_000) return "now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} h`;
  return `${Math.floor(ms / 86_400_000)} d`;
}
