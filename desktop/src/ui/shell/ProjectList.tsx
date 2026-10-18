import { useStore } from "@/app/store";
import { useCan } from "@/auth/useCan";
import { toast } from "@/ui/toast/toast";
import { NavItem } from "./NavItem";

export function ProjectList() {
  const projects = useStore((s) => s.projects);
  const projectId = useStore((s) => s.projectId);
  const screen = useStore((s) => s.screen);
  const go = useStore((s) => s.go);
  const canCreate = useCan("createProject");
  const locals = useStore((s) => s.localProjects);
  const source = useStore((s) => s.source);
  const refresh = useStore((s) => s.refresh);
  const me = useStore((s) => s.me);
  const again = async (p: { id: string; name: string }) => { await source?.syncAgain(p.id); await refresh(); toast(`${p.name} is in step again.`, me?.color ?? "var(--ok)"); };
  return (
    <>
      <div style={{ marginTop: 20, padding: "0 10px 6px", fontSize: 13, color: "var(--ink60)" }}>Projects</div>
      {projects.map((p) => {
        const stopped = locals.some((l) => l.projectId === p.id && !l.syncing);
        const row = (
          <NavItem key={p.id} active={screen === "project" && projectId === p.id} onClick={() => go(p.sample ? "asset" : "project", { projectId: p.id, assetId: p.sample ? `${p.id}/market-stall` : null })} style={stopped ? { flex: 1, minWidth: 0 } : undefined}>
            {stopped
              ? <span aria-label="Not syncing on this computer" style={{ width: 14, height: 14, borderRadius: 4, border: `1.5px solid ${p.color}`, boxSizing: "border-box", flexShrink: 0 }} />
              : <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 4, background: p.color, flexShrink: 0 }} />}
            {p.name}
            {p.sample ? <span style={{ marginLeft: "auto", font: "400 var(--t-11) var(--mono)", color: "var(--ink40)" }}>sample</span> : null}
          </NavItem>
        );
        // A project that stopped syncing here keeps its row and gets Sync again beside it.
        return stopped ? (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {row}
            <button type="button" onClick={() => void again(p)} className="nk-nav" style={{ height: 32, padding: "0 8px", borderRadius: "var(--r-6)", border: 0, background: "transparent", font: "400 var(--t-11) var(--mono)", color: "var(--ink60)", cursor: "pointer", whiteSpace: "nowrap" }}>Sync again</button>
          </div>
        ) : row;
      })}
      {canCreate ? (
        <NavItem muted onClick={() => go("newProject")}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>New project
        </NavItem>
      ) : null}
    </>
  );
}
