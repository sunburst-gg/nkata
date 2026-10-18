// The asset page: serif name, owner, "in Blender now" when live, the stage with pins, the action
// bar, the Versions row, and on the right the note, the facts and the comments.
import { useEffect } from "react";
import { useStore } from "@/app/store";
import { ActionBar } from "@/ui/asset/ActionBar";
import { AssetStage } from "@/ui/asset/AssetStage";
import { Compare } from "@/ui/asset/Compare";
import { Facts } from "@/ui/asset/Facts";
import { NoteBlock } from "@/ui/asset/NoteBlock";
import { VersionsRow } from "@/ui/asset/VersionsRow";
import { CommentList } from "@/ui/comments/CommentList";
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
  const artist = me?.role === "artist";
  useEffect(() => { if (asset) void loadComments(asset.id); }, [asset?.id, loadComments]);
  if (!asset || !project || !me) return <span style={{ color: "var(--ink60)" }}>That asset is not in this project.</span>;
  const shown: number | "live" = stop ?? (asset.live ? "live" : (asset.versions[0]?.n ?? 1));
  const file = `${asset.name.toLowerCase().replace(/ /g, "_")}.blend`;
  const notYet = (what: string) => toast(`${what} arrives in the next step.`, me.color);
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
          <ActionBar asset={asset} shown={shown} onApprove={() => notYet("Approve")} onRequestChanges={() => notYet("Request changes")} onPublish={() => notYet("Publish")} />
          <VersionsRow asset={asset} projectColor={project.color} shown={compare ? (useStore.getState().compareWith ?? shown) : shown} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
          <NoteBlock asset={asset} shown={shown} />
          <Facts asset={asset} shown={shown} artist={artist} />
          <CommentList asset={asset} comments={comments} />
        </div>
      </div>
    </div>
  );
}
