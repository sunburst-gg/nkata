// The asset page: serif name, owner, "in Blender now" when live, the stage with pins, the action
// bar, the Versions row, and on the right the note, the facts and the comments.
import { useEffect, useState } from "react";
import { openPinsLine, openPinsUpTo } from "@/app/selectors";
import { useStore } from "@/app/store";
import { can } from "@/auth/permissions";
import { useCan } from "@/auth/useCan";
import { ActionBar } from "@/ui/asset/ActionBar";
import { BudgetDialog } from "@/ui/asset/BudgetDialog";
import { ApproveOpenPinsDialog } from "@/ui/asset/ApproveOpenPinsDialog";
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
  const canAccept = useCan("acceptCheck");
  // Above the early return: a hook after it ran on some renders only, which React forbids.
  const [approveOpen, setApproveOpen] = useState(false);
  useEffect(() => { if (asset) void loadComments(asset.id); }, [asset?.id, loadComments]);
  if (!asset || !project || !me) return <span style={{ color: "var(--ink60)" }}>That asset is not in this project.</span>;
  const shown: number | "live" = stop ?? (asset.live ? "live" : (asset.versions[0]?.n ?? 1));
  const file = asset.file?.split("/").pop() ?? `${asset.name.toLowerCase().replace(/ /g, "_")}.blend`;
  const shownN = shown === "live" ? (asset.versions[0]?.n ?? 1) : shown;
  const pinsLine = openPinsLine(asset);
  // The owner is the asset's artist, a lead included (docs/decisions.md, 2026-10-27).
  const mine = asset.owner.id === me.id && can("publish", me.role);
  // Approve with pins still open asks once; yes marks them done with the approval (v8 step 14).
  const stillOpen = openPinsUpTo(comments, shownN);
  const approve = async () => {
    if (!source) return;
    if (stillOpen.length) { setApproveOpen(true); return; }
    await approveNow();
  };
  const approveNow = async () => {
    if (!source) return;
    setApproveOpen(false);
    for (const c of stillOpen) await source.resolveComment(asset.id, c.id, true);
    await source.approve(asset.id, shownN);
    useStore.setState({ stamp: true, stop: null });
    setTimeout(() => useStore.setState({ stamp: false }), 1400);
    const waived = stillOpen.length ? ` ${stillOpen.length} pin${stillOpen.length === 1 ? "" : "s"} marked done.` : "";
    toast(`Approved v${shownN}.${waived} ${asset.owner.first} knows.`, "var(--ok)");
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
            {pinsLine ? <span style={{ font: "400 var(--t-11) var(--mono)", color: "var(--bad)" }}>{pinsLine}</span> : null}
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 48, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {compare ? <Compare asset={asset} projectColor={project.color} /> : <AssetStage asset={asset} projectColor={project.color} comments={comments} shown={shown} />}
          <ActionBar asset={asset} shown={shown} onApprove={() => void approve()} onRequestChanges={() => void requestChanges()} onPublish={() => setPublishOpen(true)} />
          <VersionsRow asset={asset} projectColor={project.color} shown={compare ? (useStore.getState().compareWith ?? shown) : shown} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
          <NoteBlock asset={asset} shown={shown} />
          <Facts asset={asset} shown={shown} artist={mine} onSetBudget={canBudget && !project.sample ? () => setBudgetOpen(true) : undefined} canAccept={canAccept && !project.sample} />
          <CommentList asset={asset} comments={comments} shown={shown} />
        </div>
      </div>
      {mine ? <PublishDialog asset={asset} open={publishOpen} onOpenChange={setPublishOpen} /> : null}
      {canBudget ? <BudgetDialog asset={asset} open={budgetOpen} onOpenChange={setBudgetOpen} /> : null}
      <ApproveOpenPinsDialog open={approveOpen} count={stillOpen.length} version={shownN} onOpenChange={setApproveOpen} onApprove={() => void approveNow()} />
    </div>
  );
}
