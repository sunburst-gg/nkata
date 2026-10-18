// One project on this computer: name, size on disk in mono, Show in Finder, and a menu with
// Move and Stop syncing here. A project that stopped syncing keeps its row with Sync again.
import * as Dialog from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { useState } from "react";
import { useStore } from "@/app/store";
import type { LocalProject } from "@/data/types";
import { toast } from "@/ui/toast/toast";

const item: React.CSSProperties = { height: 36, display: "flex", alignItems: "center", padding: "0 10px", borderRadius: "var(--r-6)", cursor: "pointer", outline: "none", fontSize: 15, color: "var(--ink)" };
const quiet: React.CSSProperties = { height: 32, padding: "0 12px", borderRadius: "var(--r-6)", border: 0, background: "var(--raised)", boxShadow: "var(--shadow)", color: "var(--ink)", font: "500 13px var(--sans)", cursor: "pointer", whiteSpace: "nowrap" };

export function sizeOnDisk(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(bytes >= 1e10 ? 0 : 1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

export function ProjectDiskRow({ local }: { local: LocalProject }) {
  const source = useStore((s) => s.source);
  const me = useStore((s) => s.me);
  const refresh = useStore((s) => s.refresh);
  const [stopOpen, setStopOpen] = useState(false);
  if (!source || !me) return null;
  const move = async () => { const to = await source.moveProject(local.projectId); await refresh(); toast(`${local.name} moved. Nkata keeps watching it.`, me.color); void to; };
  const stop = async () => { await source.stopSyncing(local.projectId); setStopOpen(false); await refresh(); toast(`${local.name} stays on this computer. New saves from the team stop arriving here.`, me.color); };
  const again = async () => { await source.syncAgain(local.projectId); await refresh(); toast(`${local.name} is in step again.`, me.color); };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 0", borderTop: "1px solid var(--line)" }}>
      {local.syncing ? <span aria-label="In step" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--ok)", flexShrink: 0 }} /> : <span aria-label="Not syncing here" style={{ width: 7, height: 7, borderRadius: "50%", border: "1.5px solid var(--ink40)", boxSizing: "border-box", flexShrink: 0 }} />}
      <span style={{ flex: 1, color: "var(--ink)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{local.name}</span>
      <span style={{ font: "400 var(--t-11) var(--mono)", color: "var(--ink40)" }}>{sizeOnDisk(local.bytes)}</span>
      {local.syncing ? <button type="button" onClick={() => void source.showInFinder(local.projectId)} style={quiet}>Show in Finder</button> : <button type="button" onClick={() => void again()} style={quiet}>Sync again</button>}
      {local.syncing ? (
        <Menu.Root>
          <Menu.Trigger asChild>
            <button type="button" className="nk-nav" aria-label={`${local.name} menu`} style={{ width: 32, height: 32, borderRadius: "var(--r-6)", border: 0, background: "transparent", color: "var(--ink60)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="8" r="1.4" /><circle cx="8" cy="8" r="1.4" /><circle cx="13" cy="8" r="1.4" /></svg>
            </button>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content align="end" sideOffset={4} style={{ width: 200, background: "var(--raised)", borderRadius: "var(--r-12)", boxShadow: "var(--shadow-lift)", padding: 6, zIndex: 30, animation: "nk-rise var(--t-fast) var(--ease)" }}>
              <Menu.Item className="nk-menu-item" style={item} onSelect={() => void move()}>Move</Menu.Item>
              <Menu.Item className="nk-menu-item" style={item} onSelect={() => setStopOpen(true)}>Stop syncing here</Menu.Item>
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
      ) : null}
      <Dialog.Root open={stopOpen} onOpenChange={setStopOpen}>
        <Dialog.Portal>
          <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 40 }} />
          <Dialog.Content aria-describedby={undefined} style={{ position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: 420, background: "var(--raised)", borderRadius: "var(--r-16)", boxShadow: "var(--shadow-lift)", padding: 28, display: "flex", flexDirection: "column", gap: 16, zIndex: 41, outline: "none", animation: "nk-rise var(--t-panel) var(--ease)" }}>
            <Dialog.Title style={{ margin: 0, font: "400 var(--t-28)/1.2 var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)" }}>Stop syncing {local.name} on this computer?</Dialog.Title>
            <span style={{ fontSize: 15, color: "var(--ink60)", lineHeight: 1.5 }}>The files stay. New saves from your team will not arrive here.</span>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setStopOpen(false)} style={quiet}>Cancel</button>
              <button type="button" onClick={() => void stop()} style={{ ...quiet, color: "var(--bad)" }}>Stop syncing</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
