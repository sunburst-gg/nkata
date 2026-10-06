// Part. Version strip on the left, preview in the center, checks and comments on the right.
// Clicking a version previews it and shows a Roll back bar. Roll back makes a new version.
import { useState } from "react";
import { t } from "@/copy/en";
import { useCan, useStore } from "@/store";
import { Button } from "@/components/Button";
import { CheckRow } from "@/components/CheckRow";
import { CommentPin } from "@/components/CommentPin";
import { CommentThread } from "@/components/CommentThread";
import { EmptyPreview } from "@/components/EmptyPreview";
import { MirrorStatus } from "@/components/MirrorStatus";
import { PersonAvatar } from "@/components/PresenceAvatar";
import { RotatablePreview } from "@/components/RotatablePreview";
import { StateBadge } from "@/components/StateBadge";
import { VersionThumb } from "@/components/VersionThumb";
import { useGo, usePart, usePeople, useProject } from "@/lib/hooks";
import { ScreenHead } from "./Shell";

export function Part() {
  const found = usePart();
  const project = useProject();
  const can = useCan();
  const source = useStore((s) => s.source);
  const toast = useStore((s) => s.toast);
  const me = useStore((s) => s.db.session.user);
  const { people, by } = usePeople();
  const go = useGo();
  const [picked, setPicked] = useState<number | null>(null);
  const [activePin, setActivePin] = useState<number | undefined>(2);
  if (!found) return <span className="text-secondary">That part is not here.</span>;
  const { asset, part } = found;

  const current = part.versions[0];
  const previewVersion = picked !== null ? part.versions.find((v) => v.n === picked) : current;
  const blocking = part.checks.filter((c) => c.status === "fail" && c.blocks).length;
  const passing = part.checks.filter((c) => c.status === "pass").length;
  const canReady = part.state === "draft" && blocking === 0;
  const stateLabel = part.state === "draft" && blocking ? `Draft · ${blocking} check blocks` : undefined;
  const holder = part.lock ? by(part.lock.holderId) : null;
  const open = part.comments.filter((c) => !c.resolved).length;

  const markReady = () => {
    const r = source.markReady(asset.slug, part.name);
    if (r.ok) toast(`${part.name} is Ready. Emeka has it in the review queue.`, "ready");
    else toast(r.reason, "failed");
  };
  const fix = () => {
    const r = source.fixChecks(asset.slug, part.name);
    if (r.ok) toast("Decimated to 28,410. Textures resized to 2048. In Unreal.", "synced");
    else toast(r.reason, "failed");
  };
  const rollBack = () => {
    if (picked === null) return;
    const made = source.rollBack(asset.slug, part.name, picked);
    setPicked(null);
    toast(t("rollback.done", { part: part.name, a: picked, b: made.n }), "synced");
  };

  return (
    <div className="flex h-full flex-col gap-8">
      <ScreenHead
        title={part.name}
        line={
          <>
            <StateBadge state={part.state} label={stateLabel} />
            {holder ? <span className="inline-flex items-center gap-2"><PersonAvatar person={holder} size={20} />{holder.id === me.id ? t("lock.you") : `${holder.name.split(" ")[0]} has this part`}</span> : null}
            <MirrorStatus state={part.mirror.state} seconds={part.mirror.seconds} />
          </>
        }
        actions={
          <>
            {can("openEditors") ? <><Button>Open in Blender</Button><Button>Open in UE5</Button></> : null}
            {can("markReady") ? <Button variant={canReady ? "primary" : "secondary"} onClick={markReady}>{part.state === "ready" ? "Ready for review" : "Mark Ready"}</Button> : null}
          </>
        }
      />
      <div className="grid min-h-0 flex-1 grid-cols-[132px_minmax(0,1fr)_340px] items-start gap-8">
        <div className="flex max-h-full flex-col gap-4 overflow-auto" aria-label="Versions">
          {part.versions.map((v, i) => <VersionThumb key={v.id} version={v} current={i === 0} picked={picked === v.n} dim={i > 6} onPick={() => setPicked(i === 0 ? null : v.n)} />)}
          {part.versions.length === 0 ? <span className="text-13 text-secondary">No versions yet.</span> : null}
        </div>
        <div className="flex flex-col gap-4">
          {previewVersion?.render ? (
            <RotatablePreview frames={[previewVersion.render]} aspect="16/10" label={`v${previewVersion.n} · in Unreal · Lit`}>
              {part.comments.filter((c) => c.pin && !c.resolved).map((c) => <CommentPin key={c.id} n={c.n} tone={activePin === c.n ? "active" : "default"} at={c.pin!} onClick={() => setActivePin(c.n)} />)}
            </RotatablePreview>
          ) : <EmptyPreview owner={by(part.ownerId)} assetName={`${asset.name} / ${part.name}`} aspect="16/10" />}
          {picked !== null && can("rollBack") && current ? (
            <div className="nk-panel-in flex items-center gap-4 rounded-lg border border-border bg-panel px-5 py-4">
              <span className="flex-1">Roll back to <span className="font-mono text-14 font-medium">v{picked}</span>. It becomes v{current.n + 1} and goes to Unreal. Nothing is deleted.</span>
              <Button size="sm" className="h-8" onClick={() => setPicked(null)}>Keep v{current.n}</Button>
              <Button size="sm" variant="primary" className="h-8" onClick={rollBack}>Roll back</Button>
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-8">
          {part.checks.length ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-baseline justify-between"><span className="text-16 font-medium">Checks</span><span className="role-mono" style={{ color: blocking ? "var(--state-failed)" : "var(--state-approved)" }}>{blocking ? `${passing} of ${part.checks.length} · ${blocking} blocks` : `${passing} of ${part.checks.length} pass`}</span></div>
              <div className="flex flex-col gap-3">{part.checks.map((c) => <CheckRow key={c.id} check={c} canFix={can("fixChecks")} onFix={fix} />)}</div>
            </div>
          ) : null}
          <CommentThread comments={part.comments} people={people} activeN={activePin} countLabel={`${open} open`} onPick={setActivePin} placeholder="Reply" onAdd={can("comment") ? (text) => source.addComment(asset.slug, part.name, text) : undefined} />
        </div>
      </div>
      <span className="sr-only">{project.name}</span>
      <span className="hidden">{go ? null : null}</span>
    </div>
  );
}
