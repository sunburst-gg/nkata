// RotatablePreview. v1 scrubs a turntable image sequence on drag. With one frame it pans the
// render instead, so the drag still reads. ModelViewer is a slot for three.js and glTF later.
import { useRef, useState, type ReactNode } from "react";
import type { Render } from "@/data/types";
import { cn } from "@/lib/cn";
import { renderUrl } from "@/lib/renders";

export interface RotatablePreviewProps {
  /** Turntable frames, in order. One frame falls back to a pan. */
  frames: Render[];
  label?: string;
  aspect?: "16/9" | "16/10";
  /** Pins and other overlays. */
  children?: ReactNode;
  /** The slot for a real model viewer. When set, it replaces the frames. */
  modelViewer?: ReactNode;
  className?: string;
}

export function RotatablePreview({ frames, label, aspect = "16/9", children, modelViewer, className }: RotatablePreviewProps) {
  const [rot, setRot] = useState(0);
  const drag = useRef<{ x: number; r0: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const single = frames.length <= 1;
  const first = frames[0];
  const frameIndex = single ? 0 : ((Math.round(rot / (100 / frames.length)) % frames.length) + frames.length) % frames.length;
  const frame = frames[frameIndex] ?? first;

  const down = (e: React.PointerEvent) => { drag.current = { x: e.clientX, r0: rot }; setDragging(true); (e.target as Element).setPointerCapture?.(e.pointerId); };
  const move = (e: React.PointerEvent) => { if (!drag.current) return; setRot(Math.max(-50, Math.min(50, drag.current.r0 - (e.clientX - drag.current.x) / 6))); };
  const up = () => { drag.current = null; setDragging(false); };
  const key = (e: React.KeyboardEvent) => { if (e.key === "ArrowLeft") setRot((r) => Math.max(-50, r - 5)); if (e.key === "ArrowRight") setRot((r) => Math.min(50, r + 5)); };

  return (
    <div
      role="img"
      aria-label={label ?? "Preview. Drag or use the arrow keys to rotate."}
      tabIndex={0}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}
      className={cn("relative select-none overflow-hidden rounded-xl border border-hairline bg-panel outline-none focus-visible:shadow-focus touch-none", aspect === "16/9" ? "aspect-[16/9]" : "aspect-[16/10]", dragging ? "cursor-grabbing" : "cursor-grab", className)}
    >
      {modelViewer ?? (frame ? (
        <div aria-hidden="true" className="absolute inset-0 bg-no-repeat" style={{ backgroundImage: `url(${renderUrl(frame.key)})`, backgroundSize: single ? "150% auto" : "cover", backgroundPosition: single ? `${Math.max(0, Math.min(100, 50 + rot))}% 50%` : frame.pos, backgroundColor: "var(--preview-bg)" }} />
      ) : null)}
      {children}
      {label ? <span className="role-mono absolute bottom-4 left-4 whitespace-nowrap rounded-sm bg-[var(--scrim)] px-2 py-1 text-[var(--on-scrim)]">{label}</span> : null}
      <span className="absolute bottom-4 right-4 inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-[var(--scrim)] px-2.5 py-1 text-12 text-[var(--on-scrim)]">Drag to rotate<span className="role-mono opacity-80">{Math.round(rot * 3.6)}°</span></span>
    </div>
  );
}

/** Reserved for three.js and glTF. v1 renders nothing. */
export function ModelViewer(_props: { src: string }) {
  return null;
}
