// Connections: the Blender card with its ten states, the projects on this computer (artists),
// and the Unreal card. Viewers never reach this screen (can("seeConnections") is false).
import { useStore } from "@/app/store";
import { useCan } from "@/auth/useCan";
import { BlenderCard } from "@/ui/connections/BlenderCard";
import { ProjectDiskRow } from "@/ui/connections/ProjectDiskRow";
import { UnrealCard } from "@/ui/connections/UnrealCard";

export function ConnectionsScreen() {
  const me = useStore((s) => s.me);
  const locals = useStore((s) => s.localProjects);
  const canSee = useCan("seeConnections");
  const canDisk = useCan("seeDisk");
  if (!me || !canSee) return null;
  const artist = canDisk;
  return (
    <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 28 }}>
      <h1 style={{ margin: 0, font: "400 var(--t-40)/1.1 var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)" }}>Connections</h1>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <BlenderCard />
        <UnrealCard />
      </div>
      {artist ? (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ font: "400 20px var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)", paddingBottom: 10 }}>On this computer</span>
          {locals.length === 0 ? <span style={{ fontSize: 13, color: "var(--ink60)", padding: "14px 0", borderTop: "1px solid var(--line)" }}>No project on this computer yet. Join one and it appears here.</span> : locals.map((l) => <ProjectDiskRow key={l.projectId} local={l} />)}
        </div>
      ) : null}
    </div>
  );
}
