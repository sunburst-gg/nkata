// StateBadge. Dot 8 plus word, or a filled pill. Always a color with a word or glyph.
// Waiting is a hollow ring, not a state color. Color animates 150 ms.
import { Check, Eye, Lock, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { STATE_WORD, stateColor, type StateKey } from "@/lib/state";

export interface StateBadgeProps {
  state: StateKey;
  /** dot: 8 px dot and the word. pill: filled, for tiles. glyph: dot replaced by the state glyph. */
  variant?: "dot" | "pill" | "glyph";
  /** Replaces the state word, for example "Draft · 1 check blocks". */
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

export function StateGlyph({ state, size = 12 }: { state: StateKey; size?: number }) {
  const common = { size, strokeWidth: 2.4, "aria-hidden": true } as const;
  switch (state) {
    case "locked": return <Lock {...common} />;
    case "ready": return <Eye {...common} />;
    case "approved": return <Check {...common} />;
    case "failed": return <X {...common} />;
    default: return <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-current" />;
  }
}

export function StateDot({ state, size = 8, className }: { state: StateKey | "muted"; size?: number; className?: string }) {
  const waiting = state === "waiting";
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0 rounded-full transition-colors duration-150", waiting && "border-[1.5px] border-border", className)}
      style={{ width: size, height: size, background: stateColor(state) }}
    />
  );
}

export function StateBadge({ state, variant = "dot", label, size = "md", className }: StateBadgeProps) {
  const word = label ?? STATE_WORD[state];
  if (variant === "pill") {
    return (
      <span
        className={cn("inline-flex items-center gap-1.5 rounded-full font-medium text-state-fg transition-colors duration-150", size === "sm" ? "h-5.5 px-2 text-12" : "h-6 px-2.5 pl-2 text-12", state === "waiting" && "border border-border bg-transparent text-secondary", className)}
        style={{ background: state === "waiting" ? undefined : stateColor(state) }}
      >
        {variant === "pill" && size === "md" ? <StateGlyph state={state} /> : null}
        {word}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-2 text-body", size === "sm" ? "text-13" : "text-14", state === "waiting" && "text-muted", className)}>
      {variant === "glyph" ? <span style={{ color: stateColor(state) }} className="flex"><StateGlyph state={state} /></span> : <StateDot state={state} />}
      {word}
    </span>
  );
}
