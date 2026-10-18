// Shows only when deeper than the project: "Rising Sun / Radio", or the screen's name.
import { useStore } from "@/app/store";
import { TITLE } from "@/app/routes";

export function Breadcrumbs() {
  const screen = useStore((s) => s.screen);
  const project = useStore((s) => s.projects.find((p) => p.id === s.projectId) ?? null);
  const asset = useStore((s) => s.assets.find((a) => a.id === s.assetId) ?? null);
  const go = useStore((s) => s.go);
  if (screen === "project") return null;
  const crumbs: { label: string; go?: () => void }[] = screen === "asset" && asset && project
    ? [{ label: project.name, go: () => go("project") }, { label: asset.name }]
    : [{ label: TITLE[screen] || project?.name || "" }];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink)", fontSize: 15 }}>
      {crumbs.map((c, i) => (
        <span key={`${c.label}-${i}`} style={{ display: "contents" }}>
          {c.go ? <button type="button" onClick={c.go} style={{ border: 0, background: "transparent", padding: 0, color: "var(--ink60)", font: "inherit" }}>{c.label}</button> : <span style={{ color: "var(--ink)" }}>{c.label}</span>}
          {c.go ? <span aria-hidden="true" style={{ color: "var(--ink40)" }}>/</span> : null}
        </span>
      ))}
    </div>
  );
}
