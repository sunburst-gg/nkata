// The zero states, no sidebar: Name your studio, then Start your first project with the typed
// name chalked into the backdrop and the eight swatches tinting it. Create lands on the lead's
// empty wall and the sidebar slides in over 300 ms. App mounts the two steps with different keys,
// so the project step starts with an empty name rather than the studio's.
import { useRef, useState } from "react";
import { useStore } from "@/app/store";
import { Mark } from "@/ui/stage/Mark";
import { SWATCHES, Swatches } from "@/ui/stage/Swatches";
import { stageGradient } from "@/ui/stage/Stage";
import { GhostStage } from "@/ui/stage/GhostStage";
import { Stage } from "@/ui/stage/Stage";
import { NkViewer } from "@/viewer/NkViewer";
import { GHOST_MODEL } from "@/ui/stage/GhostStage";
import { landLive } from "@/app/bootLive";
import { LiveDataSource } from "@/data/live/LiveDataSource";

const field: React.CSSProperties = { height: 48, borderRadius: "var(--r-6)", border: 0, background: "var(--canvas)", padding: "0 14px", fontSize: 17, color: "var(--ink)", outline: "none" };
const cta: React.CSSProperties = { height: 44, borderRadius: "var(--r-6)", border: 0, background: "var(--amber)", color: "var(--amber-fg)", font: "500 15px var(--sans)", cursor: "pointer" };

export function Zero({ which }: { which: "studio" | "project" }) {
  const source = useStore((s) => s.source);
  const refresh = useStore((s) => s.refresh);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(SWATCHES[0]);
  const project = which === "project";
  const { top, bot } = stageGradient(color, "zero");
  // One submit at a time: a held Enter key once made the studio and a project of the same name.
  const busy = useRef(false);
  const next = async () => {
    if (!source || busy.current) return;
    busy.current = true;
    try { await submit(); } finally { busy.current = false; }
  };
  const submit = async () => {
    if (!source) return;
    if (!project) {
      await source.createStudio(name.trim() || "Sunburst");
      if (source instanceof LiveDataSource) { await landLive(source); return; }
      await refresh(); useStore.setState({ screen: "zeroProject" }); return;
    }
    const made = await source.createProject(name.trim() || "Rising Sun", color);
    if (source instanceof LiveDataSource) { useStore.setState({ projectId: made.id }); await landLive(source); useStore.setState({ slideIn: true }); return; }
    useStore.setState({ projectId: made.id, screen: "project", slideIn: true, filter: "Everything", group: "All" });
    await refresh();
  };
  return (
    <div style={{ minHeight: "100vh", minWidth: 1280, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(180deg, ${top}, ${bot})`, transition: "background var(--t-panel)" }}>
      <Stage grid={48} radius={16} aspect="auto" style={{ position: "absolute", inset: 0, borderRadius: 0, background: "transparent" }}>
        <NkViewer src={GHOST_MODEL} ghost autorotate={0.4} style={{ position: "absolute", inset: 0, opacity: .7 }} />
      </Stage>
      {project ? <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: "12%", transform: "translateX(-50%)", font: "400 clamp(40px, 7vw, 96px)/1 var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)", opacity: .14, whiteSpace: "nowrap", pointerEvents: "none" }}>{name}</span> : null}
      <form onSubmit={(e) => { e.preventDefault(); void next(); }} style={{ position: "relative", width: 420, display: "flex", flexDirection: "column", gap: 24, background: "var(--raised)", borderRadius: "var(--r-16)", boxShadow: "var(--shadow-lift)", padding: 32 }}>
        <Mark size={24} />
        <label htmlFor="zero-name" style={{ font: "400 28px/1.2 var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)" }}>{project ? "Start your first project." : "Name your studio."}</label>
        <input id="zero-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={project ? "Rising Sun" : "Sunburst"} style={field} />
        {project ? (
          <Swatches value={color} onPick={setColor} gap={10} />
        ) : null}
        <button type="submit" style={cta}>{project ? "Create project" : "Continue"}</button>
        {project
          ? <span style={{ fontSize: 13, color: "var(--ink60)" }}>Or <button type="button" onClick={() => useStore.getState().go("asset", { projectId: "try-nkata", assetId: "try-nkata/market-stall" })} style={{ border: 0, background: "transparent", padding: 0, font: "inherit", color: "var(--ink)", textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer" }}>look around the sample</button> first.</span>
          : <span style={{ fontSize: 13, color: "var(--ink60)" }}>Joining a team? Open the invite from your email.</span>}
      </form>
    </div>
  );
}
export { GhostStage };
