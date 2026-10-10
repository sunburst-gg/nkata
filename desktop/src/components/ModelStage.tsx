// The model in a rounded dark frame with the caption top right, and under it the pin row:
// Pin a comment, the hint, and Full screen. Without a GLB the latest render stands in.
import { Maximize2 } from "lucide-react";
import { useStore } from "@/store";
import type { ViewerSession } from "@/lib/viewer";
import { cn } from "@/lib/cn";
import { Button } from "./Button";
import { ModelViewer } from "./ModelViewer/ModelViewer";

export function PinDot({ size = 10 }: { size?: number }) {
  return <span aria-hidden="true" className="inline-block shrink-0 bg-accent" style={{ width: size, height: size, borderRadius: `${size / 2}px ${size / 2}px ${size / 2}px 1px` }} />;
}

export function Stage({ session, caption, aspect = "16/9", className, rounded = true }: { session: ViewerSession; caption?: string; aspect?: string; className?: string; rounded?: boolean }) {
  const pinning = useStore((s) => s.pinning);
  const setPendingPin = useStore((s) => s.setPendingPin);
  const setActivePin = useStore((s) => s.setActivePin);
  return (
    <div className={cn("relative overflow-hidden bg-[var(--preview-bg)]", rounded && "rounded-xl", className)} style={aspect ? { aspectRatio: aspect } : undefined}>
      {session.src ? (
        <ModelViewer src={session.src} poster={session.poster} pins={session.pins} activePin={session.activePin} pinning={pinning} onPin={(pos) => setPendingPin(pos)} onPinSelect={(id) => setActivePin(id === "pending" ? null : id)} className="absolute inset-0" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--preview-bg)] text-13 text-[var(--on-scrim)]" style={session.poster ? { backgroundImage: `url(${session.poster})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
          {session.poster ? null : "No model yet. Save a part in Blender and it appears here."}
        </div>
      )}
      {caption ? <span className="absolute right-4 top-4 whitespace-nowrap rounded-sm bg-[var(--scrim)] px-2 py-1 font-mono text-12 text-[var(--on-scrim)]">{caption}</span> : null}
    </div>
  );
}

export function PinRow({ onFull }: { onFull: () => void }) {
  const pinning = useStore((s) => s.pinning);
  const setPinning = useStore((s) => s.setPinning);
  return (
    <div className="flex items-center gap-3">
      <PinButton pinning={pinning} onToggle={() => setPinning(!pinning)} />
      <span className="text-13 text-secondary">{pinning ? "Click a spot on the model." : "Drag to orbit. Scroll to zoom."}</span>
      <Button size="sm" variant="outline" className="ml-auto" onClick={onFull} icon={<Maximize2 size={14} strokeWidth={1.5} aria-hidden="true" />}>Full screen</Button>
    </div>
  );
}

export function PinButton({ pinning, onToggle }: { pinning: boolean; onToggle: () => void }) {
  return (
    <Button size="sm" variant="outline" aria-pressed={pinning} onClick={onToggle} className={cn(pinning && "border-accent bg-active")} icon={<PinDot />}>{pinning ? "Pinning" : "Pin a comment"}</Button>
  );
}
