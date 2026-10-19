// The 16:10 lit stage with the model and its pins. A click without a drag drops a pin and opens
// the composer at its screen position; a click on a pin selects its comment. The camera never
// moves on select. Environments load their GLB in the same viewer; the render is the poster.
// The model is the picked stop's own save (modelOf), so the row drives the stage.
import { useCallback, useEffect, useRef, useState } from "react";
import { modelOf } from "@/app/selectors";
import { useStore } from "@/app/store";
import { isViewer } from "@/auth/permissions";
import { useCan } from "@/auth/useCan";
import type { Asset, Comment } from "@/data/types";
import { Stage } from "@/ui/stage/Stage";
import { NkViewer, type Pin } from "@/viewer/NkViewer";
import { Composer } from "@/ui/comments/Composer";
import { ApprovedSeal } from "./ApprovedSeal";

export function AssetStage({ asset, projectColor, comments, shown }: { asset: Asset; projectColor: string; comments: Comment[]; shown: number | "live" }) {
  const me = useStore((s) => s.me);
  const pendingPin = useStore((s) => s.pendingPin);
  const activePin = useStore((s) => s.activePin);
  const stamp = useStore((s) => s.stamp);
  const notesSeen = useStore((s) => s.notesSeen);
  const canComment = useCan("comment");
  const ref = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const pinned = comments.filter((c) => c.pin);
  const pins: Pin[] = pinned.map((c) => ({ id: c.id, pos: c.pin!, color: c.author.color }));
  if (pendingPin && me) pins.push({ id: "pending", pos: pendingPin, color: me.color });
  const onPin = useCallback((pos: [number, number, number]) => { if (canComment) useStore.setState({ pendingPin: pos, activePin: null, draft: "" }); }, [canComment]);
  const onPinSelect = useCallback((id: string) => { if (id !== "pending") useStore.setState({ activePin: id, pendingPin: null }); }, []);
  // The composer follows the pending pin's screen position, read off the viewer's pin layer.
  useEffect(() => {
    if (!pendingPin) { setAnchor(null); return; }
    let raf = 0;
    const tick = () => {
      const v = ref.current?.querySelector("nk-viewer");
      const el = v?.shadowRoot?.querySelector<HTMLElement>(".pin.active");
      if (el) setAnchor({ x: parseFloat(el.style.left), y: parseFloat(el.style.top) });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pendingPin]);
  const model = modelOf(asset, shown);
  const src = model.glb ?? "/fixtures/glb/Lantern.glb";
  // Once per person: until the first pin is made. A viewer sent a link sees it even on an asset
  // that already has pins, which is the whole of their arrival.
  const showPinNote = canComment && !notesSeen["pin"] && !pendingPin && (pinned.length === 0 || (!!me && isViewer(me.role)));
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <Stage projectColor={projectColor} radius={16} aspect="16/10" shadow>
        <NkViewer src={src} poster={model.render} pins={pins} activePin={pendingPin ? "pending" : activePin} pinning={canComment} onPin={onPin} onPinSelect={onPinSelect} style={{ position: "absolute", inset: 0 }} />
        {stamp ? <ApprovedSeal size={36} stamp style={{ position: "absolute", left: "50%", top: "50%", margin: "-40px 0 0 -40px", width: 80, height: 80, boxShadow: "var(--shadow-lift)", pointerEvents: "none" }} /> : null}
        {showPinNote ? (
          <span style={{ position: "absolute", left: 16, bottom: 16, fontSize: 13, color: "var(--ink)", background: "var(--raised)", padding: "6px 10px", borderRadius: "var(--r-6)", boxShadow: "var(--shadow)", display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--amber)" }} />Click anywhere on the model to comment.
          </span>
        ) : null}
      </Stage>
      {pendingPin && anchor ? <Composer asset={asset} anchor={anchor} /> : null}
    </div>
  );
}
