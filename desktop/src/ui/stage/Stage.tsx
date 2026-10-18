// The lit stage, as the prototype draws it on the asset page and the cards: a vertical cyclorama
// gradient from --stage-top to --stage-bot tinted with the project color through color-mix, and
// a 40 px floor grid that fades out radially. Children sit on top (the viewer, a pill).
import type { CSSProperties, ReactNode } from "react";

export interface StageProps {
  /** The project color. The stage tints toward it, 10% at the top and 14% at the floor. */
  projectColor?: string;
  radius?: 12 | 16;
  /** CSS aspect-ratio, "16/10" on the asset page, "4/3" on a card. */
  aspect?: string;
  shadow?: boolean;
  /** Grid cell in px. 40 on the asset page, 48 on the zero state. false on a card. */
  grid?: 40 | 48 | false;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function stageGradient(projectColor?: string): { top: string; bot: string } {
  if (!projectColor) return { top: "var(--stage-top)", bot: "var(--stage-bot)" };
  return { top: `color-mix(in oklab, var(--stage-top) 90%, ${projectColor})`, bot: `color-mix(in oklab, var(--stage-bot) 86%, ${projectColor})` };
}

export function Stage({ projectColor, radius = 16, aspect = "16/10", shadow = false, grid = 40, children, className, style }: StageProps) {
  const { top, bot } = stageGradient(projectColor);
  const mask = grid === 48 ? "radial-gradient(ellipse at 50% 75%, var(--mask-ink) 10%, transparent 60%)" : "radial-gradient(ellipse at 50% 75%, var(--mask-ink) 15%, transparent 65%)";
  return (
    <div className={className} style={{ aspectRatio: aspect, borderRadius: radius, overflow: "hidden", position: "relative", background: `linear-gradient(180deg, ${top}, ${bot})`, boxShadow: shadow ? "var(--shadow)" : undefined, ...style }}>
      {grid ? <div aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px)", backgroundSize: `${grid}px ${grid}px`, maskImage: mask, WebkitMaskImage: mask }} /> : null}
      {children}
    </div>
  );
}
