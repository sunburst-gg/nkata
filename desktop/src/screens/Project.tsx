// Project. The header with the folder and the owner; one flat list of assets, newest change
// first, narrowed by a team folder, a search, or the review inbox. A tile pulses once in the
// accent when its first publish lands. Folders are names the team gives: drag a tile onto one.
import { useEffect, useRef, useState, type DragEvent } from "react";
import { useCan, useStore } from "@/store";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { CONTROL } from "@/components/Field";
import { FolderDialog } from "@/components/FolderDialog";
import { MenuContent, MenuItem, MenuRoot, MenuSeparator, MenuTrigger } from "@/components/Menu";
import { PresenceAvatar } from "@/components/PresenceAvatar";
import { StateDot } from "@/components/StateBadge";
import type { Asset } from "@/data/types";
import { cn } from "@/lib/cn";
import { useFeatures, useGo, usePeople, useProject } from "@/lib/hooks";
import { folderNames, listAssets } from "@/lib/list";
import { reasonOf } from "@/lib/reason";
import { renderStyle } from "@/lib/renders";
import { STATE_WORD } from "@/lib/state";
import { inTauri } from "@/lib/tauri";

/** The drag payload: the asset's slug under this type, so only tiles drop on folders. */
const DRAG_TYPE = "text/nkata-asset";

export function Project() {
  const project = useProject();
  const db = useStore((s) => s.db);
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const pulseAsset = useStore((s) => s.pulseAsset);
  const pulse = useStore((s) => s.pulse);
  const toast = useStore((s) => s.toast);
  const setMembers = useStore((s) => s.setMembers);
  const setDeleteProject = useStore((s) => s.setDeleteProject);
  const setCreateAsset = useStore((s) => s.setCreateAsset);
  const source = useStore((s) => s.source);
  const unrealOn = useFeatures().unreal;
  const can = useCan();
  const go = useGo();
  const { by } = usePeople();
  const [rename, setRename] = useState<string | null>(null);
  // null: every asset. "": the root list. A name: that folder.
  const [folder, setFolder] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // The asset dropped on New folder, waiting for its name.
  const [newFolderFor, setNewFolderFor] = useState<Asset | null>(null);
  useEffect(() => { setFolder(null); setQuery(""); }, [project?.slug]);
  const assets = db.assets.filter((a) => a.projectSlug === project?.slug);
  // The first mirror of a new asset: the tile pulses and the toast says it reached Unreal.
  const seen = useRef(new Map<string, boolean>());
  useEffect(() => {
    for (const a of assets) {
      const had = seen.current.get(a.slug);
      if (had === false && a.render) { pulse(a.slug); toast(unrealOn ? `${a.name} / ${a.parts[0]?.name ?? "model"} synced to Unreal` : `${a.name} / ${a.parts[0]?.name ?? "model"} published`, "synced"); }
      seen.current.set(a.slug, !!a.render);
    }
  }, [assets, pulse, toast]);
  if (!project) return <span className="text-secondary">No projects yet.</span>;

  const folders = folderNames(assets);
  const ready = tab === "Ready";
  const filtered = listAssets(assets, { folder, query, ready });
  const canMove = can("moveAsset");
  const moveTo = async (slug: string, to: string) => {
    const a = assets.find((x) => x.slug === slug);
    if (!a || a.folder === to) return;
    try {
      await source.setAssetFolder(slug, to);
      toast(to ? `Moved ${a.name} to ${to}.` : `Moved ${a.name} out of ${a.folder}.`);
    } catch (err) { toast(reasonOf(err, "Move failed."), "failed"); }
  };
  const blender = db.connections.find((c) => c.id === "blender")?.connected;
  const unreal = db.connections.find((c) => c.id === "unreal")?.connected;
  const connected = !!blender && (!unrealOn || !!unreal);
  const owner = by(project.ownerId);
  const empty = assets.length
    ? ready
      ? { title: "Nothing to review", line: "Assets marked Ready land here", button: "Create asset", run: () => setCreateAsset(true) }
      : query.trim()
        ? { title: "No asset matches", line: "Search by name or by template", button: "Create asset", run: () => setCreateAsset(true) }
        : { title: folder ? `Nothing in ${folder}` : "Nothing outside a folder", line: "Drag an asset onto a folder to move it", button: "Create asset", run: () => setCreateAsset(true) }
    : connected
      ? { title: "No assets yet", line: "Save a part in Blender and it appears here", button: "Create asset", run: () => setCreateAsset(true) }
      : { title: unrealOn ? "Connect Blender and Unreal to start" : "Connect Blender to start", line: db.connections.some((c) => c.version) ? (unrealOn ? "Nkata found both on this computer." : "Nkata found it on this computer.") : (unrealOn ? "Install both, then connect them here." : "Install Blender, then connect it here."), button: "Connections", run: go.connections };
  const openFolder = () => toast(inTauri() ? `Opening ${project.folder}` : `The folder opens in the desktop app: ${project.folder}`, "muted");
  const exportProject = async () => {
    if (!source.exportAsset) { toast("Export writes the manifest in the desktop app.", "muted"); return; }
    toast("Export is per asset. Open one and press Export.", "muted");
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start gap-4">
        <span aria-hidden="true" className="size-11 shrink-0 rounded-[10px]" style={{ background: `var(--avatar-${project.tone})` }} />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="role-moment m-0 leading-[1.1] text-heading">{project.name}</h1>
          <div className="flex flex-wrap items-center gap-3 text-13 text-secondary">
            <span className="font-mono text-12">{project.folder}</span>
            <span>{project.createdLabel}</span>
            <span className="inline-flex items-center gap-1.5"><PresenceAvatar initial={owner.initial} tone={owner.tone} size={18} />{owner.name}</span>
          </div>
        </div>
        {can("openEditors") ? (
          <div className="ml-auto flex shrink-0 gap-2">
            <Button onClick={openFolder}>Open folder</Button>
            {can("manageMembers") ? <Button onClick={() => setMembers(true, project.slug)}>Members</Button> : <Button onClick={() => go.settings("members")}>Members</Button>}
            {can("renameProject") ? (
              <MenuRoot>
                <MenuTrigger asChild><Button aria-label="More" className="w-9 px-0 tracking-[0.1em]">···</Button></MenuTrigger>
                <MenuContent width={200} align="end">
                  <MenuItem onSelect={() => setRename(project.name)}>Rename</MenuItem>
                  <MenuItem onSelect={() => void exportProject()}>Export</MenuItem>
                  <MenuSeparator />
                  <MenuItem onSelect={() => setDeleteProject(project.slug)} className="text-state-failed">Delete project</MenuItem>
                </MenuContent>
              </MenuRoot>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline pb-4">
        <div role="group" aria-label="Folders" className="flex flex-wrap items-center gap-2">
          <Chip label="All" count={assets.length} active={folder === null && !ready} onClick={() => { setFolder(null); setTab("All"); }} onDrop={canMove ? (slug) => void moveTo(slug, "") : undefined} />
          {folders.map((f) => <Chip key={f} label={f} count={assets.filter((a) => a.folder === f).length} active={folder === f} onClick={() => setFolder(folder === f ? null : f)} onDrop={canMove ? (slug) => void moveTo(slug, f) : undefined} />)}
          {canMove ? <Chip label="New folder" dashed onClick={() => toast("Drag an asset here to start a folder.", "muted")} onDrop={(slug) => setNewFolderFor(assets.find((a) => a.slug === slug) ?? null)} /> : null}
          {ready ? <Chip label="Ready for review" count={filtered.length} active onClick={() => setTab("All")} /> : null}
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} type="search" aria-label="Search assets" placeholder="Search by name or template" className={cn(CONTROL, "ml-auto h-9 w-64 max-w-full rounded-full")} />
      </div>
      <Dialog open={rename !== null} onOpenChange={(o) => { if (!o) setRename(null); }} title="Rename project">
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); const name = rename?.trim(); if (name && name !== project.name) { source.renameProject(project.slug, name); toast("Project renamed."); go.project(name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); } setRename(null); }}>
          <input autoFocus value={rename ?? ""} onChange={(e) => setRename(e.target.value)} aria-label="Project name" className={CONTROL} />
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setRename(null)}>Cancel</Button><Button type="submit" variant="primary">Rename</Button></div>
        </form>
      </Dialog>
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <EmptyMark />
          <div className="flex flex-col gap-1"><span className="role-moment-sm text-heading">{empty.title}</span><span className="text-14 text-secondary">{empty.line}</span></div>
          {can("createAsset") || empty.button === "Connections" ? <Button variant="primary" onClick={empty.run}>{empty.button}</Button> : null}
        </div>
      ) : (
        <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {filtered.map((a) => <Tile key={a.id} asset={a} pulse={pulseAsset === a.slug} draggable={canMove} onOpen={() => go.asset(a.slug, project.slug)} />)}
        </div>
      )}
      <FolderDialog open={newFolderFor !== null} onOpenChange={(o) => { if (!o) setNewFolderFor(null); }} assetName={newFolderFor?.name ?? ""} onMove={(name) => { if (newFolderFor) void moveTo(newFolderFor.slug, name); }} />
    </div>
  );
}

/** A folder at the top of the list: a filter, and a drop target for a tile when onDrop is set. */
function Chip({ label, count, active, dashed, onClick, onDrop }: { label: string; count?: number; active?: boolean; dashed?: boolean; onClick: () => void; onDrop?: (slug: string) => void }) {
  const [over, setOver] = useState(false);
  const accepts = (e: DragEvent<HTMLButtonElement>) => !!onDrop && e.dataTransfer.types.includes(DRAG_TYPE);
  return (
    <button
      type="button"
      aria-pressed={!!active}
      onClick={onClick}
      onDragOver={(e) => { if (accepts(e)) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { if (!accepts(e)) return; e.preventDefault(); setOver(false); const slug = e.dataTransfer.getData(DRAG_TYPE); if (slug) onDrop?.(slug); }}
      className={cn("inline-flex h-8 cursor-pointer items-center gap-2 rounded-full border bg-transparent px-3 text-13 transition-colors duration-150", active ? "border-heading bg-raised text-heading" : "border-hairline text-secondary hover:text-heading", dashed ? "border-dashed" : "", over ? "border-accent text-heading" : "")}
    >
      {label}{count !== undefined ? <span className="role-mono text-muted">{count}</span> : null}
    </button>
  );
}

function EmptyMark() {
  return (
    <div aria-hidden="true" className="relative h-18 w-24 overflow-hidden rounded-xl border border-border bg-panel shadow-soft">
      <div className="absolute left-3 top-3 h-7.5 w-10 rounded-md bg-raised" />
      <div className="absolute left-15 top-3 h-2 w-6 rounded-sm bg-border" />
      <div className="absolute left-15 top-6.5 h-2 w-4 rounded-sm bg-hairline" />
      <span className="absolute bottom-2 right-2.5 size-3.5 rounded-full border-2 border-panel bg-[var(--avatar-9)]" />
    </div>
  );
}

export function Tile({ asset, pulse, draggable = false, onOpen }: { asset: Asset; pulse: boolean; draggable?: boolean; onOpen: () => void }) {
  const { by } = usePeople();
  return (
    <button type="button" onClick={onOpen} draggable={draggable} onDragStart={draggable ? (e) => { e.dataTransfer.setData(DRAG_TYPE, asset.slug); e.dataTransfer.effectAllowed = "move"; } : undefined} className={cn("relative cursor-pointer overflow-hidden rounded-xl border bg-panel p-0 text-left transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:shadow-soft", pulse ? "nk-pulse-border border-accent" : "border-hairline")}>
      <div className="relative aspect-[4/3] bg-[var(--preview-bg)]" style={asset.render ? renderStyle(asset.render, "tile") : undefined}>
        {!asset.render ? <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-12 text-[var(--on-scrim)]">{asset.noRenderText ?? "No render yet"}</span> : null}
        <span className="absolute left-3 top-3 inline-flex h-5.5 items-center gap-1.5 rounded-md bg-[var(--avatar-fg)] px-2 text-12 font-medium text-[var(--accent-fg)]"><StateDot state={asset.state} size={7} />{STATE_WORD[asset.state]}</span>
        {asset.syncIssue ? <span title="Not in Unreal. The editor is closed." aria-label="Not in Unreal. The editor is closed." className="absolute right-3 top-3 size-2.5 rounded-full border-2 border-[var(--avatar-fg)] bg-state-syncing" /> : null}
        {asset.present.length > 0 ? (
          <div className="absolute bottom-3 right-3 flex">
            {asset.present.map((id) => { const p = by(id); return <PresenceAvatar key={id} initial={p.initial} tone={p.tone} name={p.name} size={26} ring="var(--avatar-fg)" className="-ml-1.5 text-11" />; })}
          </div>
        ) : null}
      </div>
      <div className="flex items-baseline gap-2 px-4 pb-3.5 pt-3">
        <span className="min-w-0 flex-1 truncate text-16 font-medium text-heading">{asset.name}</span>
        {asset.template ? <span className="shrink-0 rounded-md bg-raised px-1.5 py-0.5 text-11 text-secondary">{asset.template}</span> : null}
        <span className="whitespace-nowrap text-13 text-muted">{asset.when}</span>
      </div>
    </button>
  );
}
