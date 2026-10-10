// Part. Versions down the left, the model in the middle, checks and comments on the right.
// Click a version to preview it; the Roll back bar appears. Roll back creates a new version.
import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { useCan, useStore } from "@/store";
import { Button } from "@/components/Button";
import { CommentRail } from "@/components/CommentRail";
import { PinRow, Stage } from "@/components/ModelStage";
import { StateDot } from "@/components/StateBadge";
import type { Asset, Check as CheckModel, Part as PartModel } from "@/data/types";
import { cn } from "@/lib/cn";
import { firstName, usePart, usePeople } from "@/lib/hooks";
import { renderStyle } from "@/lib/renders";
import { STATE_WORD } from "@/lib/state";
import { useViewerSession } from "@/lib/viewer";
import { useResetViewer } from "./Asset";

export function Part() {
  const found = usePart();
  useResetViewer(found ? `${found.asset.slug}/${found.part.name}` : "");
  if (!found) return <span className="text-secondary">That part is not in this asset.</span>;
  return <PartScreen key={found.part.id} asset={found.asset} part={found.part} />;
}

function PartScreen({ asset, part }: { asset: Asset; part: PartModel }) {
  const can = useCan();
  const toast = useStore((s) => s.toast);
  const source = useStore((s) => s.source);
  const setFullScreen = useStore((s) => s.setFullScreen);
  const { by } = usePeople();
  const session = useViewerSession(asset, part);
  const [picked, setPicked] = useState<number | null>(null);
  const top = part.versions[0];
  const current = top?.n ?? 0;
  const preview = picked ?? current;
  const owner = firstName(by(part.ownerId).name);
  const open = (where: "Blender" | "Unreal") => toast(`Opening in ${where}.`, "locked");
  const rollBack = () => {
    if (!picked) return;
    const made = source.rollBack(asset.slug, part.name, picked);
    setPicked(null);
    toast(`Rolled back. v${made.n} is v${picked}.`);
  };
  const fix = (c: CheckModel) => {
    const r = source.fixChecks(asset.slug, part.name);
    if (r.ok) toast(`${c.name} fixed. Check passes.`); else toast(r.reason, "failed");
  };
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <h1 className="role-moment m-0 leading-[1.1] text-heading">{`${asset.name} / ${part.name}`}</h1>
        <span className="inline-flex items-center gap-1.5 text-13 text-secondary"><StateDot state={part.state} size={7} />{`${STATE_WORD[part.state]} · ${owner}${top ? ` · v${current}` : ""}`}</span>
        {can("openEditors") ? <div className="ml-auto flex gap-2"><Button onClick={() => open("Blender")}>Open in Blender</Button><Button onClick={() => open("Unreal")}>Open in Unreal</Button></div> : null}
      </div>
      <div className="grid items-start gap-6" style={{ gridTemplateColumns: "112px minmax(0, 1fr) 320px" }}>
        <div className="flex flex-col gap-3">
          {part.versions.length === 0 ? <span className="text-12 text-secondary">No versions yet.</span> : null}
          {part.versions.slice(0, 4).map((v) => (
            <button key={v.id} type="button" aria-pressed={picked === v.n} onClick={() => setPicked(picked === v.n || v.n === current ? null : v.n)} className={cn("cursor-pointer overflow-hidden rounded-[10px] border-2 bg-panel p-0 text-left transition-colors duration-150", picked === v.n ? "border-accent" : "border-hairline")}>
              <div className="aspect-[4/3] bg-[var(--preview-bg)]" style={v.render ? renderStyle(v.render, "tile") : undefined} />
              <div className="flex justify-between px-2 py-1.5 text-12"><span className="font-mono text-heading">v{v.n}</span><span className="text-muted">{v.when}</span></div>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <Stage session={session} caption={top ? `v${preview} · ${owner} · in Unreal` : "No publish yet"} aspect="16/10" />
          <PinRow onFull={() => setFullScreen({ assetSlug: asset.slug, partName: part.name })} />
          {picked && can("rollBack") ? (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-panel px-4 py-3 shadow-soft nk-panel-in">
              <span className="flex-1 text-14 text-body">Roll back to v{picked}? This creates v{current + 1}. Nothing is lost.</span>
              <Button size="sm" variant="outline" onClick={() => setPicked(null)}>Cancel</Button>
              <Button size="sm" variant="primary" onClick={rollBack}>Roll back</Button>
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <span className="role-moment-sm text-heading">Checks</span>
            {part.checks.length === 0 ? <span className="text-13 text-secondary">Checks run on the first save.</span> : null}
            {part.checks.map((c) => <CheckRow key={c.id} check={c} onFix={can("fixChecks") && c.fixable && c.status !== "pass" ? () => fix(c) : undefined} />)}
          </div>
          <CommentRail session={session} emptyText="No comments yet." />
        </div>
      </div>
    </div>
  );
}

function CheckRow({ check, onFix }: { check: CheckModel; onFix?: () => void }) {
  const pass = check.status === "pass";
  const [shake, setShake] = useState(!pass);
  useEffect(() => { if (shake) { const t = setTimeout(() => setShake(false), 200); return () => clearTimeout(t); } return undefined; }, [shake]);
  return (
    <div className={cn("flex items-center gap-2.5 border-b border-hairline py-2", shake && "nk-shake")}>
      <span aria-hidden="true" className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[var(--avatar-fg)]" style={{ background: pass ? "var(--state-approved)" : check.status === "warn" ? "var(--state-syncing)" : "var(--state-failed)" }}>
        {pass ? <Check size={10} strokeWidth={2.5} /> : <X size={10} strokeWidth={2.5} />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col"><span className="text-14 text-heading">{check.name}</span><span className="text-13 text-secondary">{check.detail}</span></div>
      {onFix ? <Button size="xs" variant="outline" onClick={onFix}>Fix</Button> : null}
    </div>
  );
}
