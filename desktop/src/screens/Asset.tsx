// Asset. Parts across the top, the model with Pin a comment and Full screen, comments on the right.
import { useEffect } from "react";
import { useCan, useStore } from "@/store";
import { Button } from "@/components/Button";
import { CommentRail } from "@/components/CommentRail";
import { PinRow, Stage } from "@/components/ModelStage";
import { PresenceAvatar } from "@/components/PresenceAvatar";
import { StateDot } from "@/components/StateBadge";
import type { Asset as AssetModel, Part } from "@/data/types";
import { useAsset, useGo, usePeople } from "@/lib/hooks";
import { renderStyle } from "@/lib/renders";
import { STATE_WORD } from "@/lib/state";
import { useViewerSession } from "@/lib/viewer";
import { agent } from "@/lib/tauri";

/** Leaving a model screen ends pinning and drops an unposted pin. */
export function useResetViewer(key: string) {
  const setPinning = useStore((s) => s.setPinning);
  useEffect(() => () => { setPinning(false); useStore.setState({ activePin: null }); }, [key, setPinning]);
}

export function Asset() {
  const asset = useAsset();
  const go = useGo();
  useResetViewer(asset?.slug ?? "");
  if (!asset) return <span className="text-secondary">That asset is not in this project.</span>;
  return <AssetScreen asset={asset} onPart={(p) => go.part(asset.slug, p.name, asset.projectSlug)} />;
}

function AssetScreen({ asset, onPart }: { asset: AssetModel; onPart: (p: Part) => void }) {
  const can = useCan();
  const toast = useStore((s) => s.toast);
  const source = useStore((s) => s.source);
  const setFullScreen = useStore((s) => s.setFullScreen);
  const { by } = usePeople();
  const session = useViewerSession(asset);
  const top = asset.parts[0]?.versions[0];
  const caption = top ? `Last publish · v${top.n} · ${top.when}` : "No publish yet";
  const open = (where: "Blender" | "Unreal") => toast(`Opening in ${where}.`, "locked");
  const exportAsset = async () => {
    try {
      const json = source.exportAsset ? await source.exportAsset(asset.slug) : null;
      if (json) { const path = await agent.writeExport("", asset.slug, json); toast(`Exported to ${path}`); } else toast(`${asset.name} exported.`);
    } catch (err) { toast(err instanceof Error ? err.message : "Export failed.", "failed"); }
  };
  const gated = asset.parts.find((p) => p.gate.length > 0);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="role-moment m-0 leading-[1.1] text-heading">{asset.name}</h1>
        <span className="text-13 text-secondary">{asset.meta}</span>
        <div className="ml-auto flex gap-2">
          {can("openEditors") ? <><Button onClick={() => open("Blender")}>Open in Blender</Button><Button onClick={() => open("Unreal")}>Open in Unreal</Button></> : null}
          {can("exportAsset") && !can("openEditors") ? null : can("exportAsset") ? <Button onClick={() => void exportAsset()}>Export</Button> : null}
          {can("assign") ? <Button onClick={() => toast("Assign opens in the next release. Owners come from the template for now.", "muted")}>Assign</Button> : null}
          {can("removeGate") ? <Button onClick={() => { if (gated) { source.removeGate(asset.slug, gated.name); toast(`Gate removed on ${asset.name} / ${gated.name}.`); } else toast("No gate on this asset.", "muted"); }}>Remove gate</Button> : null}
          {can("downloadImages") && !can("openEditors") ? <Button onClick={() => toast("Images download in the desktop app.", "muted")}>Download images</Button> : null}
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-1">
        {asset.parts.map((p) => {
          const owner = by(p.ownerId);
          const render = p.versions[0]?.render ?? p.render;
          return (
            <button key={p.id} type="button" onClick={() => onPart(p)} className="w-42 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-hairline bg-panel p-0 text-left transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-soft">
              <div className="relative aspect-[4/3] bg-[var(--preview-bg)]" style={render ? renderStyle(render, "tile") : undefined}>
                <PresenceAvatar initial={owner.initial} tone={owner.tone} name={owner.name} size={22} ring="var(--avatar-fg)" className="absolute bottom-2 left-2 text-10" />
              </div>
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span className="flex-1 truncate text-14 font-medium text-heading">{p.name}</span>
                <StateDot state={p.state} size={7} /><span className="text-12 text-secondary">{STATE_WORD[p.state]}</span>
              </div>
            </button>
          );
        })}
      </div>
      <div className="grid items-start gap-6" style={{ gridTemplateColumns: "minmax(0, 1fr) 320px" }}>
        <div className="flex flex-col gap-3">
          <Stage session={session} caption={caption} aspect="16/9" />
          <PinRow onFull={() => setFullScreen({ assetSlug: asset.slug })} walkable={asset.kind === "Levels"} />
        </div>
        <CommentRail session={session} />
      </div>
    </div>
  );
}
