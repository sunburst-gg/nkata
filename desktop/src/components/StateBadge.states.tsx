import { StateBadge } from "./StateBadge";
import type { StateKey } from "@/lib/state";

const states: StateKey[] = ["locked", "draft", "ready", "approved", "failed", "waiting", "synced", "syncing", "sync-failed"];

export function StateBadgeStates() {
  return (
    <div className="flex flex-wrap gap-8">
      {states.map((s) => (
        <div key={s} className="flex min-w-37 flex-col gap-2.5">
          <StateBadge state={s} />
          <StateBadge state={s} variant="pill" />
          <StateBadge state={s} variant="glyph" size="sm" />
          <span className="role-mono text-muted">--state-{s}</span>
        </div>
      ))}
    </div>
  );
}
