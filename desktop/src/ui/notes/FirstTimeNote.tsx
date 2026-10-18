// One dark callout with a pointer, anchored to its target, shown once per person per idea (live,
// pin) and stored per user. "Got it" dismisses it; so does any click on it.
import { useStore } from "@/app/store";

export function FirstTimeNote({ idea, text, style, pointer = "top" }: { idea: "live" | "pin"; text: string; style?: React.CSSProperties; pointer?: "top" | "bottom" }) {
  const seen = useStore((s) => s.notesSeen[idea]);
  const mark = useStore((s) => s.markNoteSeen);
  if (seen) return null;
  return (
    <div role="note" onClick={(e) => { e.stopPropagation(); mark(idea); }} style={{ position: "absolute", width: 240, background: "var(--toast-bg)", color: "var(--toast-fg)", fontSize: 13, lineHeight: 1.45, padding: "10px 12px", borderRadius: 8, boxShadow: "var(--shadow-lift)", zIndex: 2, cursor: "pointer", animation: "nk-rise var(--t-panel) var(--ease)", ...style }}>
      <span aria-hidden="true" style={{ position: "absolute", left: 14, [pointer === "top" ? "top" : "bottom"]: -6, width: 12, height: 12, background: "var(--toast-bg)", transform: "rotate(45deg)" }} />
      {text}
      <span style={{ display: "block", marginTop: 6, color: "var(--toast-fg-60)" }}>Got it</span>
    </div>
  );
}
