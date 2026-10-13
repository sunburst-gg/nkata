// Asset. Parts across the top, the model with Pin a comment and Full screen, comments on the right.
import { useEffect, useState } from "react";
import { useCan, useStore } from "@/store";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { CONTROL, Field, Select } from "@/components/Field";
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
import { reasonOf } from "@/lib/reason";

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
  const [assigning, setAssigning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const training = useStore((s) => s.db.session.studio.training) === "on";
  const session = useViewerSession(asset);
  const top = asset.parts[0]?.versions[0];
  const caption = top ? `Last publish · v${top.n} · ${top.when}` : "No publish yet";
  const open = (where: "Blender" | "Unreal") => toast(`Opening in ${where}.`, "locked");
  const exportAsset = async () => {
    try {
      const json = source.exportAsset ? await source.exportAsset(asset.slug) : null;
      if (json) { const path = await agent.writeExport("", asset.slug, json); toast(`Exported to ${path}`); } else toast(`${asset.name} exported.`);
    } catch (err) { toast(reasonOf(err, "Export failed."), "failed"); }
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
          {can("assign") ? <Button onClick={() => setAssigning(true)}>Assign</Button> : null}
          {can("confirmRights") && !asset.rights ? <Button onClick={() => setConfirming(true)}>Confirm rights</Button> : null}
          {can("removeGate") ? <Button onClick={() => { if (gated) { source.removeGate(asset.slug, gated.name); toast(`Gate removed on ${asset.name} / ${gated.name}.`); } else toast("No gate on this asset.", "muted"); }}>Remove gate</Button> : null}
          {can("downloadImages") && !can("openEditors") ? <Button onClick={() => toast("Images download in the desktop app.", "muted")}>Download images</Button> : null}
        </div>
      </div>
      {asset.rights ? (
        <span className="text-13 text-secondary">{`Rights: ${asset.rights.statement} Confirmed by ${by(asset.rights.confirmedById).name}.`}</span>
      ) : training ? (
        <span className="text-13 text-secondary">{can("confirmRights") ? "Rights not confirmed. Publish waits until you confirm who holds them." : "Rights not confirmed. Publish waits on an art director or producer."}</span>
      ) : null}
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
      <AssignDialog asset={asset} open={assigning} onOpenChange={setAssigning} />
      <RightsDialog asset={asset} open={confirming} onOpenChange={setConfirming} />
    </div>
  );
}

/** Who owns each part. The owner is who Blender lists the part for, and who can mark it Ready. */
function AssignDialog({ asset, open, onOpenChange }: { asset: AssetModel; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { people } = usePeople();
  const source = useStore((s) => s.source);
  const toast = useStore((s) => s.toast);
  const [busy, setBusy] = useState<string | null>(null);
  const assign = async (p: Part, personId: string) => {
    setBusy(p.name);
    try {
      await source.assignOwner(asset.slug, p.name, personId || null);
      const who = people.find((x) => x.id === personId);
      toast(who ? `${asset.name} / ${p.name} is ${who.name.split(" ")[0]}'s.` : `${asset.name} / ${p.name} has no owner.`);
    } catch (err) {
      toast(reasonOf(err, "Could not assign the part."), "failed");
    } finally {
      setBusy(null);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Assign" description="Who owns each part. Blender lists a part for its owner, and the owner marks it Ready." width={480}>
      <div className="flex flex-col gap-3">
        {asset.parts.map((p) => (
          <label key={p.id} className="grid items-center gap-3" style={{ gridTemplateColumns: "120px minmax(0, 1fr)" }}>
            <span className="truncate text-14 font-medium text-heading">{p.name}</span>
            <Select value={p.ownerId} disabled={busy === p.name} onChange={(e) => void assign(p, e.target.value)}>
              <option value="">No owner</option>
              {people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          </label>
        ))}
        <div className="flex justify-end"><Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button></div>
      </div>
    </Dialog>
  );
}

/** One line on who holds the rights. While the studio trains, Publish waits on it. */
function RightsDialog({ asset, open, onOpenChange }: { asset: AssetModel; open: boolean; onOpenChange: (open: boolean) => void }) {
  const source = useStore((s) => s.source);
  const toast = useStore((s) => s.toast);
  const studioName = useStore((s) => s.db.session.studio.name);
  const [statement, setStatement] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setStatement(""); }, [open]);
  const confirm = async () => {
    if (!statement.trim()) return;
    setBusy(true);
    try {
      await source.confirmRights(asset.slug, statement.trim());
      toast(`Rights to ${asset.name} confirmed.`);
      onOpenChange(false);
    } catch (err) {
      toast(reasonOf(err, "Could not confirm the rights."), "failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Confirm rights" description="Who holds the rights to this asset. One line, kept with the asset." width={480}>
      <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); void confirm(); }}>
        <Field label="Who holds the rights"><input autoFocus value={statement} onChange={(e) => setStatement(e.target.value)} placeholder={`${studioName || "The studio"} owns this asset outright.`} className={CONTROL} /></Field>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" variant="primary" loading={busy} disabled={!statement.trim()}>Confirm</Button></div>
      </form>
    </Dialog>
  );
}
