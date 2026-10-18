// Object card: the lit stage edge to edge tinted by the project color, the model on a contact
// shadow, hover turns it (the viewer's hover-rotate). The pooled viewer caps live contexts at 8;
// a card outside the viewport or past the cap shows its cached still, and the ghost before one exists.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Asset } from "@/data/types";
import { Stage } from "@/ui/stage/Stage";
import { NkViewer } from "@/viewer/NkViewer";
import { CardMeta } from "./CardMeta";
import { CornerPill, type Corner } from "./CornerPill";
import { Ghost } from "./Ghost";

export interface CardProps { asset: Asset; projectColor: string; corner: Corner; pulse?: boolean; fill?: boolean; onOpen: () => void; note?: ReactNode }

export function ObjectCard({ asset, projectColor, corner, pulse, fill, onOpen, note }: CardProps) {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // The ghost shows while the viewer holds no context (data-live) and has no still (data-still):
  // past the pool cap, or before the first frame rendered.
  const [state, setState] = useState({ live: false, still: false });
  useEffect(() => {
    const el = ref.current?.querySelector("nk-viewer");
    if (!el) return;
    const read = () => setState({ live: el.hasAttribute("data-live"), still: el.hasAttribute("data-still") });
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ["data-still", "data-live"] });
    read();
    return () => mo.disconnect();
  }, []);
  const hasStill = state.still;
  const ghost = !(state.live && loaded) && !hasStill;
  const anim = pulse ? "nk-pulse-once 1.1s ease-out" : fill ? "nk-fill 800ms ease-out" : undefined;
  return (
    <div ref={ref} className="nk-card" role="link" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }} style={{ display: "flex", flexDirection: "column", gap: 12, cursor: "pointer", outline: "none" }}>
      <Stage projectColor={projectColor} radius={12} aspect="4/3" shadow grid={false} style={{ animation: anim }}>
        {ghost ? <Ghost /> : null}
        <div aria-hidden="true" style={{ position: "absolute", left: "22%", right: "22%", bottom: "10%", height: "8%", borderRadius: "50%", background: "radial-gradient(ellipse at center, var(--contact), transparent 70%)" }} />
        <NkViewer src={asset.glb} hoverRotate onLoaded={() => setLoaded(true)} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
        <CornerPill kind={corner} />
        {note}
      </Stage>
      <CardMeta asset={asset} />
    </div>
  );
}
