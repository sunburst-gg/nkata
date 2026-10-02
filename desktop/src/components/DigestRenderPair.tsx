// DigestRenderPair. Last week beside this week, labels in mono. The older side is dimmed.
import type { DigestRenderPair as Model } from "@/data/types";
import { renderStyle } from "@/lib/renders";

export function DigestRenderPair({ pair, onOpen }: { pair: Model; onOpen?: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex flex-col gap-3 text-left outline-none focus-visible:shadow-focus rounded-xl">
      <div className="grid grid-cols-2 gap-1 overflow-hidden rounded-xl">
        <div className="relative aspect-[4/3] saturate-60 brightness-85" style={renderStyle(pair.before, "tile")}><span className="role-mono absolute left-2.5 top-2.5 rounded-sm bg-[var(--scrim)] px-2 py-0.75 text-[var(--on-scrim)]">{pair.beforeLabel}</span></div>
        <div className="relative aspect-[4/3]" style={renderStyle(pair.after, "tile")}><span className="role-mono absolute left-2.5 top-2.5 rounded-sm bg-[var(--scrim)] px-2 py-0.75 text-[var(--on-scrim)]">{pair.afterLabel}</span></div>
      </div>
      <div className="flex items-baseline gap-3"><span className="text-16 font-medium">{pair.name}</span><span className="text-13 text-secondary">{pair.note}</span></div>
    </button>
  );
}
