// State words and glyphs. Always pair the color with a word or glyph.
import type { AssetState, PartState } from "@/data/types";

export type StateKey = "draft" | "locked" | "ready" | "approved" | "failed" | "waiting" | "synced" | "syncing" | "sync-failed";

export const STATE_WORD: Record<StateKey, string> = {
  draft: "Draft",
  locked: "Locked",
  ready: "Ready",
  approved: "Approved",
  failed: "Failed check",
  waiting: "Waiting",
  synced: "Synced",
  syncing: "Syncing",
  "sync-failed": "Sync failed",
};

/** CSS color for a state. Waiting has no fill; callers draw a ring. */
export function stateColor(state: StateKey | "muted"): string {
  if (state === "waiting") return "transparent";
  if (state === "muted") return "var(--fg-muted)";
  return `var(--state-${state})`;
}

export function partStateKey(state: PartState | AssetState): StateKey {
  return state;
}
