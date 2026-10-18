// Review on the part view: Approve or Send back at the bottom, for reviewers, on a Ready part.
// Send back needs one line and pins it on the mesh when a pin is pending, else it is a plain
// comment. Score is one to five (docs/tasks/07-blender-first.md, slice 9).
import { useState } from "react";
import { useStore } from "@/store";
import { Button } from "@/components/Button";
import { PinDot } from "@/components/ModelStage";
import type { Asset, Part } from "@/data/types";
import { cn } from "@/lib/cn";
import { reasonOf } from "@/lib/reason";

const SCORES = [1, 2, 3, 4, 5];

export function ReviewBar({ asset, part }: { asset: Asset; part: Part }) {
  const source = useStore((s) => s.source);
  const toast = useStore((s) => s.toast);
  const pendingPin = useStore((s) => s.pendingPin);
  const setPendingPin = useStore((s) => s.setPendingPin);
  const [score, setScore] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const line = note.trim();
  const decide = async (decision: "approve" | "send_back") => {
    if (score === null) return;
    setBusy(true);
    try {
      await source.review(asset.slug, part.name, decision, score, line, decision === "send_back" && pendingPin ? pendingPin : undefined);
      setPendingPin(null);
      setNote("");
      setScore(null);
      toast(decision === "approve" ? `${asset.name} / ${part.name} approved.` : `${asset.name} / ${part.name} sent back.`, decision === "approve" ? "synced" : "muted");
    } catch (err) { toast(reasonOf(err, "Review failed."), "failed"); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-panel p-4 shadow-soft" aria-label="Review">
      <div className="flex items-center gap-3">
        <span className="role-moment-sm text-heading">Review</span>
        <span className="text-13 text-secondary">Score it, then Approve or Send back.</span>
        <div className="ml-auto flex gap-1" role="radiogroup" aria-label="Score">
          {SCORES.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={score === n} onClick={() => setScore(n)} className={cn("size-8 cursor-pointer rounded-full border text-13 transition-colors duration-150", score === n ? "border-heading bg-raised text-heading" : "border-hairline bg-transparent text-secondary hover:text-heading")}>{n}</button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {pendingPin ? <span className="inline-flex shrink-0 items-center gap-1.5 text-12 text-secondary"><PinDot size={14} />Pinned</span> : null}
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={pendingPin ? "What to change, pinned where you clicked" : "What to change. Pin a point on the model to place it."} aria-label="Review note" className="h-10 flex-1 rounded-[10px] border border-border bg-panel px-3 text-14 text-heading outline-none placeholder:text-muted focus:border-accent" />
        <Button variant="outline" disabled={busy || score === null || !line} onClick={() => void decide("send_back")}>Send back</Button>
        <Button variant="primary" disabled={busy || score === null} onClick={() => void decide("approve")}>Approve</Button>
      </div>
    </div>
  );
}
