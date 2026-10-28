// The reusable lit stage with the ghost model: the sample model as an amber wireframe at about
// 35%, turning slowly. On the first save the same viewer instance drops the ghost and fills over
// 800 ms (nk-fill); with reduced motion it crossfades in 150 ms. No remount, no new context.
import type { CSSProperties, ReactNode } from "react";
import { Stage, type StageProps } from "./Stage";
import { NkViewer } from "@/viewer/NkViewer";

// The Lantern's geometry alone, 234 KB, shipped in every build. The fixtures are dev only, so a
// release build had no ghost (scripts/ghost-model.py, docs/decisions.md 2026-10-28).
export const GHOST_MODEL = "/models/Ghost.glb";

export function GhostStage({ filled = false, src = GHOST_MODEL, opacity = 1, speed = 0.5, children, ...stage }: { filled?: boolean; src?: string; opacity?: number; speed?: number; children?: ReactNode } & Omit<StageProps, "children">) {
  const style: CSSProperties = { position: "absolute", inset: 0, opacity, animation: filled ? "nk-fill 800ms ease-out" : undefined };
  return (
    <Stage {...stage}>
      <NkViewer src={src} ghost={!filled} autorotate={speed} className="nk-ghost-stage" style={style} />
      {children}
    </Stage>
  );
}
