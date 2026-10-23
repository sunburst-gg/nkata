// Artist or viewer, empty: the Stage with the ghost, one line, one button, one secondary line.
// On the artist's first save the Stage fills from wireframe to shaded and reads "Your team sees
// this now."; it stays full size for the rest of that visit.
import { useStore } from "@/app/store";
import { usePlace } from "@/app/usePlace";
import { isViewer } from "@/auth/permissions";
import { GhostStage } from "@/ui/stage/GhostStage";
import { toast } from "@/ui/toast/toast";
import { FirstTimeNote } from "@/ui/notes/FirstTimeNote";

export function StageEmpty() {
  const me = useStore((s) => s.me);
  const filled = useStore((s) => s.firstSaveFilled);
  const project = useStore((s) => s.projects.find((p) => p.id === s.projectId) ?? null);
  const assets = useStore((s) => s.assets);
  const { live: onServer, place } = usePlace();
  const go = useStore((s) => s.go);
  if (!me) return null;
  const viewer = isViewer(me.role);
  const live = assets.find((a) => a.live);
  const title = filled ? "Your team sees this now." : viewer ? "Nothing to look at yet." : "Open Blender and save.";
  const line = filled ? "When it is ready to hand off, press Publish in Blender and write one line." : viewer ? "You get a notification when the first version is ready." : `Any .blend you save into ${project?.name ?? "the project"} shows up here, in 3D, for the whole team.`;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 7fr) minmax(0, 5fr)", gap: 48, alignItems: "center" }}>
      <div style={{ position: "relative" }}>
        <GhostStage filled={filled} src={live?.glb} radius={16} aspect="4/3" shadow grid={40} projectColor={filled ? project?.color : undefined}>
          {filled && live ? <span style={{ position: "absolute", left: 12, top: 12, fontSize: 12, color: "var(--ink)", background: "var(--raised)", padding: "3px 9px", borderRadius: "var(--r-6)", boxShadow: "var(--shadow)" }}>Live</span> : null}
          {filled && live ? <FirstTimeNote idea="live" text={`Live means ${live.owner.first}'s latest save. Not handed off yet. You can still comment.`} style={{ left: 12, top: 46 }} /> : null}
        </GhostStage>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <span style={{ font: "400 28px/1.2 var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)" }}>{title}</span>
        <span style={{ fontSize: 15, color: "var(--ink60)", lineHeight: 1.55 }}>{line}</span>
        {!viewer && !filled && !onServer ? <button type="button" onClick={() => toast("Blender is opening with the Nkata panel.", me.color)} style={{ alignSelf: "flex-start", height: 44, padding: "0 22px", borderRadius: "var(--r-6)", border: 0, background: "var(--amber)", color: "var(--amber-fg)", font: "500 15px var(--sans)", cursor: "pointer", boxShadow: "var(--shadow)" }}>Open Blender</button> : null}
        {!viewer && !filled && onServer && !place ? <button type="button" onClick={() => go("connections")} style={{ alignSelf: "flex-start", height: 44, padding: "0 22px", borderRadius: "var(--r-6)", border: 0, background: "var(--amber)", color: "var(--amber-fg)", font: "500 15px var(--sans)", cursor: "pointer", boxShadow: "var(--shadow)" }}>Choose where {project?.name ?? "it"} lives</button> : null}
        {!viewer && !filled && onServer && place ? <span style={{ font: "400 var(--t-11) var(--mono)", color: "var(--ink60)" }}>{place}</span> : null}
        {!viewer && !filled ? <span style={{ fontSize: 13, color: "var(--ink60)" }}>Already have a .blend? In Blender, press Add to {project?.name ?? "the project"}.</span> : null}
      </div>
    </div>
  );
}
