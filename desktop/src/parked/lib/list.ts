// The project list: one flat list, newest change first, narrowed by a folder, a search, or the
// review inbox. Folders are the names assets carry, so the list of folders is read off the assets.
// See docs/tasks/07-blender-first.md, slice 7.
import type { Asset } from "@/data/types";

export interface ListFilter {
  /** A folder name, "" for the root list, or null for every asset. */
  folder: string | null;
  /** Matched against the name and the template, case folded. */
  query: string;
  /** The review inbox: only assets that are Ready. */
  ready: boolean;
}

/** Folder names in use, each once, in alphabetical order. The root is not a folder. */
export function folderNames(assets: readonly Asset[]): string[] {
  return [...new Set(assets.map((a) => a.folder).filter((f) => f !== ""))].sort((a, b) => a.localeCompare(b));
}

/** The assets the list shows, newest change first. */
export function listAssets(assets: readonly Asset[], filter: ListFilter): Asset[] {
  const q = filter.query.trim().toLocaleLowerCase();
  const kept = assets.filter((a) => {
    if (filter.ready && a.state !== "ready") return false;
    if (filter.folder !== null && a.folder !== filter.folder) return false;
    if (q && !a.name.toLocaleLowerCase().includes(q) && !a.template.toLocaleLowerCase().includes(q)) return false;
    return true;
  });
  return kept.sort(byLastChange);
}

/** Newest first by changedAt when both carry one, else by the source's own order. */
export function byLastChange(a: Asset, b: Asset): number {
  if (a.changedAt && b.changedAt && a.changedAt !== b.changedAt) return a.changedAt < b.changedAt ? 1 : -1;
  return a.changedOrder - b.changedOrder;
}

/** A folder name as the team typed it: trimmed, no slashes, at most 60 characters. */
export function cleanFolderName(name: string): string | null {
  const clean = name.trim();
  if (clean === "" || clean.length > 60 || /[/\\]/.test(clean)) return null;
  return clean;
}
