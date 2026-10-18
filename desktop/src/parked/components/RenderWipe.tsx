// Two renders under a wipe: drag the handle, or press F to flip between them. The reviewer reads
// a change under real lighting here; the model shows the shape.
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

export function RenderWipe({ before, after, labels, className }: { before: string; after: string; labels: [string, string]; className?: string }) {
  const [at, setAt] = useState(50);
  const [flip, setFlip] = useState<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "f" || e.metaKey || e.ctrlKey || (e.target as HTMLElement | null)?.tagName === "INPUT") return;
      setFlip((f) => (f === null ? (at < 50 ? 100 : 0) : null));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [at]);
  const shown = flip ?? at;
  return (
    <div className={cn("relative select-none overflow-hidden rounded-xl bg-[var(--preview-bg)]", className)} role="group" aria-label={`${labels[0]} against ${labels[1]}`}>
      <img src={after} alt={labels[1]} draggable={false} className="absolute inset-0 h-full w-full object-cover" />
      <img src={before} alt={labels[0]} draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: `inset(0 ${100 - shown}% 0 0)` }} />
      <span aria-hidden="true" className="absolute inset-y-0 w-px bg-[var(--avatar-fg)]" style={{ left: `${shown}%` }} />
      <span className="absolute left-4 top-4 rounded-sm bg-[var(--scrim)] px-2 py-1 font-mono text-12 text-[var(--on-scrim)]">{labels[0]}</span>
      <span className="absolute right-4 top-4 rounded-sm bg-[var(--scrim)] px-2 py-1 font-mono text-12 text-[var(--on-scrim)]">{labels[1]}</span>
      <input type="range" min={0} max={100} value={shown} onChange={(e) => { setFlip(null); setAt(Number(e.target.value)); }} aria-label="Wipe" className="absolute inset-x-0 bottom-0 h-full w-full cursor-ew-resize opacity-0" />
      <span className="absolute bottom-4 left-4 rounded-sm bg-[var(--scrim)] px-2 py-1 font-mono text-12 text-[var(--on-scrim)]">Drag to wipe · F to flip</span>
    </div>
  );
}
