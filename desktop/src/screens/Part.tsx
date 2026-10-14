// Part. The note first, then the card with the delta from the last publish, the four dots, and
// the model. Versions down the left with their notes, checks and comments on the right. Click a
// version to preview it; the Roll back bar appears. Roll back creates a new version.
// The receiver knows what changed without opening the file (docs/tasks/07-blender-first.md).
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Check, Minus, Plus, X } from "lucide-react";
import { useCan, useStore } from "@/store";
import { Button } from "@/components/Button";
import { CommentRail } from "@/components/CommentRail";
import { PinRow, Stage } from "@/components/ModelStage";
import { RenderWipe } from "@/components/RenderWipe";
import { StateDot } from "@/components/StateBadge";
import type { Asset, Check as CheckModel, Part as PartModel } from "@/data/types";
import { cn } from "@/lib/cn";
import { publishCard } from "@/lib/card";
import { diffLines, diffManifests } from "@/lib/diff";
import { firstName, useFeatures, usePart, usePeople } from "@/lib/hooks";
import { renderSrc, renderStyle } from "@/lib/renders";
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
  const [params, setParams] = useSearchParams();
  // ?compare=N opens the part comparing vN with the current version (the activity rail links here).
  const compareParam = Number(params.get("compare"));
  const [compare, setCompare] = useState(Number.isFinite(compareParam) && compareParam > 0);
  const [picked, setPicked] = useState<number | null>(compare ? compareParam : null);
  const top = part.versions[0];
  const current = top?.n ?? 0;
  const preview = picked ?? current;
  const shownVersion = part.versions.find((v) => v.n === preview);
  const session = useViewerSession(asset, part, shownVersion);
  const owner = firstName(by(part.ownerId).name);
  // Compare: the picked (older) version against the current one.
  const older = compare && picked && picked !== current ? part.versions.find((v) => v.n === picked) : undefined;
  const diff = older && top ? diffManifests(older.manifest, top.manifest) : null;
  // The card for the shown version, with the delta from the publish before it.
  const shownAt = shownVersion ? part.versions.findIndex((v) => v.id === shownVersion.id) : -1;
  const previous = shownAt >= 0 ? part.versions.slice(shownAt + 1).find((v) => v.manifest && v.published !== false) : undefined;
  const card = publishCard(shownVersion?.manifest, previous?.manifest);
  const dots = part.checks.filter((c) => c.severity === "block");
  const toggleCompare = () => {
    const on = !compare;
    setCompare(on);
    setPicked(on ? (part.versions[1]?.n ?? null) : null);
    if (!on && params.has("compare")) { params.delete("compare"); setParams(params, { replace: true }); }
  };
  const unrealOn = useFeatures().unreal;
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
        {can("openEditors") ? <div className="ml-auto flex gap-2"><Button onClick={() => open("Blender")}>Open in Blender</Button>{unrealOn ? <Button onClick={() => open("Unreal")}>Open in Unreal</Button> : null}</div> : null}
      </div>
      {shownVersion ? (
        <div className="flex flex-col gap-4 rounded-xl border border-hairline bg-panel p-5">
          <p className="role-moment-md m-0 text-heading">{shownVersion.note || "No note yet. The artist writes one on Publish."}</p>
          <span className="text-13 text-secondary">{`v${shownVersion.n} · ${firstName(by(shownVersion.authorId).name)} · ${shownVersion.when}${previous ? ` · changes since v${previous.n}` : ""}`}</span>
          {shownVersion.noteEngineering ? (
            <details className="text-14 text-body">
              <summary className="cursor-pointer text-13 text-secondary">Details for engineers</summary>
              <p className="m-0 mt-2 whitespace-pre-wrap">{shownVersion.noteEngineering}</p>
            </details>
          ) : null}
          {card ? (
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
              {card.rows.map((r) => (
                <div key={r.label} className="flex flex-col gap-0.5">
                  <span className="text-12 text-secondary">{r.label}</span>
                  <span className="role-mono text-16 text-heading">{r.value}</span>
                  {r.delta ? <span className="role-mono text-12 text-secondary">{r.delta}</span> : null}
                </div>
              ))}
            </div>
          ) : <span className="text-13 text-secondary">No card yet. The first save in Blender writes it.</span>}
          {card && card.textureNames.length > 0 ? <span className="role-mono text-12 text-secondary">{card.textureNames.join(" · ")}</span> : null}
          {dots.length > 0 ? (
            <div className="flex items-center gap-2" aria-label="Blocking checks">
              {dots.map((c) => <span key={c.id} role="img" aria-label={`${c.name}: ${c.detail}`} title={`${c.name}: ${c.detail}`} className="size-2.5 rounded-full" style={{ background: c.status === "pass" ? "var(--state-approved)" : c.status === "warn" ? "var(--state-syncing)" : "var(--state-failed)" }} />)}
              <span className="text-12 text-secondary">{dots.every((c) => c.status === "pass") ? `${dots.length} checks green` : `${dots.filter((c) => c.status !== "pass").length} of ${dots.length} checks block`}</span>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="grid items-start gap-6" style={{ gridTemplateColumns: "148px minmax(0, 1fr) 320px" }}>
        <div className="flex flex-col gap-3">
          {part.versions.length > 1 ? <Button size="xs" variant="outline" aria-pressed={compare} onClick={toggleCompare} className={cn("self-start", compare && "border-accent bg-active")}>Compare</Button> : null}
          {part.versions.length === 0 ? <span className="text-12 text-secondary">No versions yet.</span> : null}
          {part.versions.slice(0, 6).map((v) => (
            <button key={v.id} type="button" aria-pressed={picked === v.n} onClick={() => setPicked(picked === v.n || v.n === current ? null : v.n)} className={cn("cursor-pointer overflow-hidden rounded-[10px] border-2 bg-panel p-0 text-left transition-colors duration-150", picked === v.n ? "border-accent" : "border-hairline")}>
              <div className="aspect-[4/3] bg-[var(--preview-bg)]" style={v.render ? renderStyle(v.render, "tile") : undefined} />
              <div className="flex flex-col gap-0.5 px-2 py-1.5 text-12">
                <div className="flex justify-between"><span className="font-mono text-heading">v{v.n}</span><span className="text-muted">{v.when}</span></div>
                {v.note ? <span className="line-clamp-2 text-12 text-secondary">{v.note}</span> : null}
              </div>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          {older && older.render && top?.render ? (
            <RenderWipe before={renderSrc(older.render)} after={renderSrc(top.render)} labels={[`v${older.n}`, `v${top.n}`]} className="aspect-[16/10]" />
          ) : (
            <Stage session={session} caption={top ? (unrealOn ? `v${preview} · ${owner} · in Unreal` : `v${preview} · ${owner}`) : "No publish yet"} aspect="16/10" />
          )}
          <PinRow onFull={() => setFullScreen({ assetSlug: asset.slug, partName: part.name })} walkable={asset.kind === "Levels"} />
          {picked && !compare && can("rollBack") ? (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-panel px-4 py-3 shadow-soft nk-panel-in">
              <span className="flex-1 text-14 text-body">Roll back to v{picked}? This creates v{current + 1}. Nothing is lost.</span>
              <Button size="sm" variant="outline" onClick={() => setPicked(null)}>Cancel</Button>
              <Button size="sm" variant="primary" onClick={rollBack}>Roll back</Button>
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-6">
          {compare ? (
            <div className="flex flex-col gap-3">
              <span className="role-moment-sm text-heading">What changed</span>
              {!older ? <span className="text-13 text-secondary">Pick an older version to compare with v{current}.</span> : null}
              {older && !diff ? <span className="text-13 text-secondary">v{older.n} and v{current} have no manifest to compare. The renders tell the story.</span> : null}
              {older && diff ? (
                <>
                  <span className="font-mono text-12 text-muted">v{older.n} to v{current}</span>
                  {diffLines(diff).map((l) => (
                    <div key={l.text} className="flex items-center gap-2.5 border-b border-hairline py-2 text-14 text-heading">
                      <span aria-hidden="true" className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[var(--avatar-fg)]" style={{ background: l.tone === "added" ? "var(--state-approved)" : l.tone === "removed" ? "var(--state-failed)" : l.tone === "touched" ? "var(--accent)" : "var(--fg-muted)" }}>
                        {l.tone === "added" ? <Plus size={10} strokeWidth={2.5} /> : l.tone === "removed" ? <Minus size={10} strokeWidth={2.5} /> : l.tone === "touched" ? <span className="size-1.5 rounded-full bg-[var(--accent-fg)]" /> : <Check size={10} strokeWidth={2.5} />}
                      </span>
                      <span>{l.text}</span>
                    </div>
                  ))}
                </>
              ) : null}
            </div>
          ) : null}
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
