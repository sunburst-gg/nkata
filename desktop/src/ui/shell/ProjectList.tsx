import { useStore } from "@/app/store";
import { useCan } from "@/auth/useCan";
import { NavItem } from "./NavItem";

export function ProjectList() {
  const projects = useStore((s) => s.projects);
  const projectId = useStore((s) => s.projectId);
  const screen = useStore((s) => s.screen);
  const go = useStore((s) => s.go);
  const canCreate = useCan("createProject");
  return (
    <>
      <div style={{ marginTop: 20, padding: "0 10px 6px", fontSize: 13, color: "var(--ink60)" }}>Projects</div>
      {projects.map((p) => (
        <NavItem key={p.id} active={screen === "project" && projectId === p.id} onClick={() => go(p.sample ? "asset" : "project", { projectId: p.id, assetId: p.sample ? `${p.id}/market-stall` : null })}>
          <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 4, background: p.color }} />
          {p.name}
          {p.sample ? <span style={{ marginLeft: "auto", font: "400 var(--t-11) var(--mono)", color: "var(--ink40)" }}>sample</span> : null}
        </NavItem>
      ))}
      {canCreate ? (
        <NavItem muted onClick={() => go("newProject")}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>New project
        </NavItem>
      ) : null}
    </>
  );
}
