// Asset. Parts as a strip of thumbnails, a large rotatable preview, comments on the right.
// Export, Remove gate, Assign top right for those who can. A viewer gets Download images.
import { useState } from "react";
import { t } from "@/copy/en";
import { useCan, useStore } from "@/store";
import { Button } from "@/components/Button";
import { CommentThread } from "@/components/CommentThread";
import { Dialog } from "@/components/Dialog";
import { EmptyPreview } from "@/components/EmptyPreview";
import { PartThumb } from "@/components/PartThumb";
import { RotatablePreview } from "@/components/RotatablePreview";
import { useAsset, useGo, usePeople, useProject } from "@/lib/hooks";
import { ScreenHead } from "./Shell";

export function Asset() {
  const asset = useAsset();
  const project = useProject();
  const can = useCan();
  const source = useStore((s) => s.source);
  const toast = useStore((s) => s.toast);
  const { people, by } = usePeople();
  const go = useGo();
  const [gateFor, setGateFor] = useState<string | null>(null);
  if (!asset) return <span className="text-secondary">That asset is not in {project.name}.</span>;

  const approved = asset.parts.filter((p) => p.state === "approved").length;
  const gated = asset.parts.find((p) => p.state === "waiting" && p.gate.length > 0);
  const comments = asset.parts.flatMap((p) => p.comments);
  const owner = by(asset.ownerId);
  const firstPart = asset.parts.find((p) => p.state !== "waiting") ?? asset.parts[0];
  const kind = asset.kind.replace(/s$/, "");
  const line = `${kind} · ${approved} of ${asset.parts.length} approved${asset.usedIn.length ? ` · in ${asset.usedIn.join(" and ")}` : ""}`;

  return (
    <div className="flex flex-col gap-8">
      <ScreenHead
        title={asset.name}
        line={line}
        actions={
          <>
            {can("exportProject") ? <Button>Export</Button> : can("exportAsset") ? null : null}
            {can("removeGate") && gated ? <Button onClick={() => setGateFor(gated.name)}>Remove gate</Button> : null}
            {can("assign") ? <Button>Assign</Button> : null}
            {can("downloadImages") && !can("exportProject") ? <Button onClick={() => toast(`Downloading ${asset.parts.length * 3} images of ${asset.name}.`, "synced")}>Download images</Button> : null}
          </>
        }
      />
      <div className="flex gap-6">
        {asset.parts.map((p) => <PartThumb key={p.id} part={p} owner={by(p.ownerId)} active={p.id === firstPart?.id} onOpen={() => go.part(asset.slug, p.name, project.slug)} />)}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-8">
        {asset.render ? <RotatablePreview frames={[asset.render]} label="Approved parts · in Unreal · Lit" /> : <EmptyPreview owner={owner} assetName={asset.name} />}
        <CommentThread comments={comments} people={people} showPart onAdd={can("comment") && firstPart ? (text) => source.addComment(asset.slug, firstPart.name, text) : undefined} />
      </div>
      {gated ? (
        <Dialog open={gateFor !== null} onOpenChange={(o) => { if (!o) setGateFor(null); }} title={t("gate.confirm", { part: gated.name })} description={`${by(gated.ownerId).name.split(" ")[0]} can start before ${gated.gate[0]} is approved. The asset timeline will say "${by(useStore.getState().db.session.user.id).name.split(" ")[0]} removed the gate on ${gated.name}."`} actions={<><Button autoFocus onClick={() => setGateFor(null)}>Keep gate</Button><Button variant="primary" onClick={() => { source.removeGate(asset.slug, gated.name); setGateFor(null); toast(`Gate removed on ${gated.name}. ${by(gated.ownerId).name.split(" ")[0]} can start now.`, "approved"); }}>Remove gate</Button></>} />
      ) : null}
    </div>
  );
}
