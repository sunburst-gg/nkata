// New project, inside the shell: name, the eight swatches, the backdrop preview tinted by the
// pick, one primary action. Markup from the prototype's NEW PROJECT block; the preview reuses
// the zero state's stage pieces.
import { useState } from "react";
import { useStore } from "@/app/store";
import { SWATCHES } from "@/ui/stage/swatches";
import { Swatches } from "@/ui/stage/Swatches";
import { Stage, stageGradient } from "@/ui/stage/Stage";
import { GHOST_MODEL } from "@/ui/stage/GhostStage";
import { NkViewer } from "@/viewer/NkViewer";

const field: React.CSSProperties = { height: 44, borderRadius: "var(--r-6)", border: 0, background: "var(--raised)", boxShadow: "var(--shadow)", padding: "0 14px", fontSize: 15, color: "var(--ink)", outline: "none" };
const cta: React.CSSProperties = { alignSelf: "flex-start", height: 44, padding: "0 22px", borderRadius: "var(--r-6)", border: 0, background: "var(--amber)", color: "var(--amber-fg)", font: "500 15px var(--sans)", cursor: "pointer" };

export function NewProjectScreen() {
  const source = useStore((s) => s.source);
  const refresh = useStore((s) => s.refresh);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(SWATCHES[0]);
  const { top, bot } = stageGradient(color, "zero");
  const create = async () => {
    if (!source) return;
    const made = await source.createProject(name.trim() || "New project", color);
    useStore.setState({ projectId: made.id, screen: "project", filter: "Everything", group: "All", firstSaveFilled: false });
    await refresh();
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); void create(); }} style={{ maxWidth: 520, display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 style={{ margin: 0, font: "400 var(--t-40)/1.1 var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)" }}>New project</h1>
        <span style={{ color: "var(--ink60)" }}>Every artist keeps the project on their own computer. Nkata keeps them in step.</span>
      </div>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" aria-label="Project name" style={field} />
      <Swatches value={color} onPick={setColor} />
      <Stage grid={40} radius={12} aspect="16/9" style={{ background: `linear-gradient(180deg, ${top}, ${bot})`, transition: "background var(--t-panel)" }}>
        {name.trim() ? <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: "10%", transform: "translateX(-50%)", font: "400 clamp(28px, 6vw, 56px)/1 var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)", opacity: .14, whiteSpace: "nowrap", pointerEvents: "none" }}>{name}</span> : null}
        <NkViewer src={GHOST_MODEL} ghost autorotate={0.4} style={{ position: "absolute", inset: 0, opacity: .7 }} />
      </Stage>
      <button type="submit" style={cta}>Create project</button>
    </form>
  );
}
