// The asset page: serif name, owner, "in Blender now" when live, the stage with pins, the action
// bar, the Versions row, and on the right the note, the facts and the comments.
import { useEffect, useState } from "react";
import { useStore } from "@/app/store";
import { isArtist } from "@/auth/permissions";
import { useCan } from "@/auth/useCan";
import { ActionBar } from "@/ui/asset/ActionBar";
import { BudgetDialog } from "@/ui/asset/BudgetDialog";
import { AssetStage } from "@/ui/asset/AssetStage";
import { Compare } from "@/ui/asset/Compare";
import { Facts } from "@/ui/asset/Facts";
import { NoteBlock } from "@/ui/asset/NoteBlock";
import { VersionsRow } from "@/ui/asset/VersionsRow";
import { CommentList } from "@/ui/comments/CommentList";
import { PublishDialog } from "@/ui/publish/PublishDialog";
import { toast } from "@/ui/toast/toast";
import type { Comment } from "@/data/types";

// A stable empty list: a selector that returned a fresh array each read would loop React.
const NONE: Comment[] = [];

export function AssetScreen() {
  const asset = useStore((s) => s.assets.find((a) => a.id === s.assetId) ?? null);
  const project = useStore((s) => s.projects.find((p) => p.id === s.projectId) ?? null);
  const comments = useStore((s) => (s.assetId ? s.comments[s.assetId] : undefined) ?? NONE);
  const stop = useStore((s) => s.stop);
  const compare = useStore((s) => s.compare);
  const me = useStore((s) => s.me);
  const loadComments = useStore((s) => s.loadComments);
  const source = useStore((s) => s.source);
  const [publishOpen, setPublishOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const canBudget = useCan("setBudget");
  const artist = !!me && isArtist(me.role);
  useEffect(() => { if (asset) void loadComments(asset.id); }, [asset?.id, loadComments]);
  if (!asset || !project || !me) return <span style={{ color: "var(--ink60)" }}>That asset is not in this project.</span>;
  const shown: number | "live" = stop ?? (asset.live ? "live" : (asset.versions[0]?.n ?? 1));
  const file = `${asset.name.toLowerCase().replace(/ /g, "_")}.blend`;
  const shownN = shown === "live" ? (asset.versions[0]?.n ?? 1) : shown;
  const approve = async () => {
    if (!source) return;
    await source.approve(asset.id, shownN);
    useStore.setState({ stamp: true, stop: null });
    setTimeout(() => useStore.setState({ stamp: false }), 1400);
    toast(`Approved v${shownN}. ${asset.owner.first} knows.`, "var(--ok)");
  };
  // Request changes needs a pin or a written line from me on this Version (Decisions 13).
  const requestChanges = async () => {
    if (!source) return;
    const mine = comments.some((c) => c.author.id === me.id);
    if (!mine) { toast("Pin the spot on the model, or write one line, before you send it back.", me.color); return; }
    await source.requestChanges(asset.id, shownN);
    useStore.setState({ stop: null });
    toast(`Sent to ${asset.owner.first}. The pin is in Blender now.`, "var(--bad)");
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 1360 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, font: "400 var(--t-40)/1.1 var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)" }}>{asset.name}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--ink60)" }}>
            <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: "50%", background: asset.owner.color, color: "var(--on-color)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 600 }}>{asset.owner.initial}</span>
            {asset.owner.first}
            {asset.live ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: asset.owner.color, animation: "nk-breathe 2.4s var(--ease) infinite" }} />in Blender now</span> : null}
            <span style={{ font: "400 var(--t-11) var(--mono)", color: "var(--ink40)" }}>{file}</span>
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 48, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {compare ? <Compare asset={asset} projectColor={project.color} /> : <AssetStage asset={asset} projectColor={project.color} comments={comments} />}
          <ActionBar asset={asset} shown={shown} onApprove={() => void approve()} onRequestChanges={() => void requestChanges()} onPublish={() => setPublishOpen(true)} />
          <VersionsRow asset={asset} projectColor={project.color} shown={compare ? (useStore.getState().compareWith ?? shown) : shown} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
          <NoteBlock asset={asset} shown={shown} />
          <Facts asset={asset} shown={shown} artist={artist} onSetBudget={canBudget && !project.sample ? () => setBudgetOpen(true) : undefined} />
          <CommentList asset={asset} comments={comments} />
        </div>
      </div>
      {artist ? <PublishDialog asset={asset} open={publishOpen} onOpenChange={setPublishOpen} /> : null}
      {canBudget ? <BudgetDialog asset={asset} open={budgetOpen} onOpenChange={setBudgetOpen} /> : null}
    </div>
  );
}
