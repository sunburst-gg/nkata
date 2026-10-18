// Object card: the lit stage edge to edge tinted by the project color, the model on a contact
// shadow, hover turns it (the viewer's hover-rotate). The pooled viewer caps live contexts at 8;
// a card outside the viewport or past the cap shows its cached still, and the ghost before one exists.
import { useEffect, useRef, useState } from "react";
import type { Asset } from "@/data/types";
import { Stage } from "@/ui/stage/Stage";
import { NkViewer } from "@/viewer/NkViewer";
import { CardMeta } from "./CardMeta";
import { CornerPill, type Corner } from "./CornerPill";
import { Ghost } from "./Ghost";

export interface CardProps { asset: Asset; projectColor: string; corner: Corner; pulse?: boolean; fill?: boolean; onOpen: () => void }

export function ObjectCard({ asset, projectColor, corner, pulse, fill, onOpen }: CardProps) {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // The ghost shows until the first frame rendered or a still exists. The viewer sets data-still
  // on release once it has one.
  const [hasStill, setHasStill] = useState(false);
  useEffect(() => {
    const el = ref.current?.querySelector("nk-viewer");
    if (!el) return;
    const mo = new MutationObserver(() => setHasStill(el.hasAttribute("data-still")));
    mo.observe(el, { attributes: true, attributeFilter: ["data-still"] });
    return () => mo.disconnect();
  }, []);
  const anim = pulse ? "nk-pulse-once 1.1s ease-out" : fill ? "nk-fill 800ms ease-out" : undefined;
  return (
    <div ref={ref} className="nk-card" role="link" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }} style={{ display: "flex", flexDirection: "column", gap: 12, cursor: "pointer", outline: "none" }}>
      <Stage projectColor={projectColor} radius={12} aspect="4/3" shadow grid={false} style={{ animation: anim }}>
        {!loaded && !hasStill ? <Ghost /> : null}
        <div aria-hidden="true" style={{ position: "absolute", left: "22%", right: "22%", bottom: "10%", height: "8%", borderRadius: "50%", background: "radial-gradient(ellipse at center, var(--contact), transparent 70%)" }} />
        <NkViewer src={asset.glb} hoverRotate onLoaded={() => setLoaded(true)} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
        <CornerPill kind={corner} />
      </Stage>
      <CardMeta asset={asset} />
    </div>
  );
}
