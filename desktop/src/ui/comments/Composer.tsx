// The composer opens at the pin, with the pending pin in my color. Enter posts, Esc cancels.
// Without an anchor (the plain input under the comments) it posts an unpinned comment.
import { useEffect, useRef } from "react";
import { useStore } from "@/app/store";
import type { Asset } from "@/data/types";
import { toast } from "@/ui/toast/toast";

export async function post(asset: Asset): Promise<void> {
  const s = useStore.getState();
  const text = s.draft.trim();
  if (!text || !s.source || !s.me) return;
  const c = await s.source.comment(asset.id, text, s.pendingPin ?? undefined);
  useStore.setState({ draft: "", pendingPin: null, activePin: c.pin ? c.id : null, notesSeen: { ...s.notesSeen, pin: true } });
  await s.loadComments(asset.id);
  toast(c.pin ? "Pinned. It is in the Blender viewport now." : "Comment posted.", s.me.color);
}

export function Composer({ asset, anchor }: { asset: Asset; anchor: { x: number; y: number } }) {
  const draft = useStore((s) => s.draft);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const cancel = () => useStore.setState({ pendingPin: null, draft: "" });
  // Keep the card inside the stage: flip left of the pin near the right edge.
  const flip = anchor.x > 640;
  return (
    <div role="dialog" aria-label="New comment" style={{ position: "absolute", left: flip ? undefined : anchor.x + 14, right: flip ? `calc(100% - ${anchor.x - 14}px)` : undefined, top: Math.max(8, anchor.y - 22), width: 300, display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: "var(--r-12)", background: "var(--raised)", boxShadow: "var(--shadow-lift)", animation: "nk-drop var(--t-panel) var(--ease)", zIndex: 5 }}>
      <input ref={input} value={draft} onChange={(e) => useStore.setState({ draft: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") void post(asset); if (e.key === "Escape") cancel(); }} placeholder="Say what you see" aria-label="Say what you see" style={{ height: 36, borderRadius: "var(--r-6)", border: 0, background: "var(--canvas)", padding: "0 10px", fontSize: 15, color: "var(--ink)", outline: "none" }} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={cancel} style={{ height: 32, padding: "0 10px", borderRadius: "var(--r-6)", border: 0, background: "transparent", color: "var(--ink60)", font: "500 13px var(--sans)", cursor: "pointer" }}>Cancel</button>
        <button type="button" onClick={() => void post(asset)} style={{ height: 32, padding: "0 12px", borderRadius: "var(--r-6)", border: 0, background: "var(--amber)", color: "var(--amber-fg)", font: "500 13px var(--sans)", cursor: "pointer" }}>Post</button>
      </div>
    </div>
  );
}
