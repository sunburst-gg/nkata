// Arrival, before the shell: who invited you, the project, the faces, one button. Artists get the
// self-ticking setup list; each row ticks on a DataSource event. Viewers land straight on the
// asset they were sent.
import { useEffect } from "react";
import { useStore } from "@/app/store";
import { PEOPLE } from "@/data/mock";
import type { MockDataSource } from "@/data/mock";
import { Mark } from "@/ui/stage/Mark";
import { GHOST_MODEL } from "@/ui/stage/GhostStage";
import { NkViewer } from "@/viewer/NkViewer";

const ROWS: { step: "blender" | "addon" | "project"; text: string; meta: string }[] = [
  { step: "blender", text: "Blender found", meta: "4.2.3" },
  { step: "addon", text: "Nkata add-on installed", meta: "" },
  { step: "project", text: "Rising Sun ready on this computer", meta: "Show in Finder" },
];

export function Arrival() {
  const me = useStore((s) => s.me);
  const source = useStore((s) => s.source);
  const setupDone = useStore((s) => s.setupDone);
  const go = useStore((s) => s.go);
  const studio = useStore((s) => s.studio);
  const viewer = me?.role === "viewer";
  const artist = me?.role === "artist";
  useEffect(() => { if (artist && source && "startArrivalSetup" in source) (source as MockDataSource).startArrivalSetup(); }, [artist, source]);
  if (!me) return null;
  const done = setupDone.length >= 3;
  const faces = viewer ? ["E", "C", "N", "T"] : ["E", "C", "N", "T"];
  const title = viewer ? "Njoku wants you to look at Market stall." : done ? `You are set, ${me.first}.` : "Emeka invited you to Rising Sun.";
  const line = viewer ? "Nothing to install. The model turns, you click it, you say what you see." : `A 1960s Nigeria story by ${studio?.name ?? "Sunburst"}. Four people are in it already.`;
  const teamLine = viewer ? "Njoku, Chidi, Ngozi and Tobe are in it" : "Emeka, Chidi, Ngozi and Tobe";
  return (
    <div style={{ minHeight: "100vh", minWidth: 1280, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", alignItems: "stretch", background: "var(--canvas)" }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "64px 72px", gap: 32 }}>
        <Mark size={28} />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h1 style={{ margin: 0, font: "400 var(--t-40)/1.1 var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)" }}>{title}</h1>
          <span style={{ fontSize: 15, color: "var(--ink60)", lineHeight: 1.55, maxWidth: 420 }}>{line}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", paddingLeft: 8 }}>{faces.map((k) => { const p = PEOPLE[k as keyof typeof PEOPLE]; return <span key={k} aria-label={p.name} style={{ width: 32, height: 32, borderRadius: "50%", background: p.color, color: "var(--on-color)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, border: "2px solid var(--canvas)", marginLeft: -8 }}>{k}</span>; })}</div>
          <span style={{ fontSize: 13, color: "var(--ink60)" }}>{teamLine}</span>
        </div>
        {artist ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }} aria-label="Setup">
            {ROWS.map((r) => { const ok = setupDone.includes(r.step); return (
              <div key={r.step} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span aria-label={ok ? "done" : "pending"} style={{ width: 20, height: 20, borderRadius: "50%", background: ok ? "var(--ok)" : "transparent", border: `1.5px solid ${ok ? "var(--ok)" : "var(--line)"}`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background var(--t-panel)" }}>
                  {ok ? <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="var(--on-color)" strokeWidth="2.5" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" /></svg> : null}
                </span>
                <span style={{ color: "var(--ink80)" }}>{r.text}</span>
                {r.meta === "Show in Finder" ? <button type="button" onClick={() => void source?.openInBlender("")} style={{ marginLeft: "auto", border: 0, background: "transparent", padding: 0, font: "400 var(--t-11) var(--mono)", color: "var(--ink40)", cursor: "pointer" }}>{r.meta}</button> : <span style={{ font: "400 var(--t-11) var(--mono)", color: "var(--ink40)", marginLeft: "auto" }}>{r.meta}</span>}
              </div>
            ); })}
          </div>
        ) : null}
        <button type="button" onClick={() => (viewer ? go("asset", { projectId: "try-nkata", assetId: "try-nkata/market-stall" }) : go("project"))} style={{ alignSelf: "flex-start", height: 44, padding: "0 22px", borderRadius: "var(--r-6)", border: 0, background: "var(--amber)", color: "var(--amber-fg)", font: "500 15px var(--sans)", cursor: "pointer", boxShadow: "var(--shadow)" }}>{viewer ? "Look at it" : "Join Rising Sun"}</button>
      </div>
      <div style={{ position: "relative", background: "linear-gradient(180deg, var(--stage-top), var(--stage-bot))", overflow: "hidden" }}>
        <NkViewer src={GHOST_MODEL} autorotate={0.5} style={{ position: "absolute", inset: 0 }} />
        <div aria-hidden="true" style={{ position: "absolute", inset: "auto 0 0 0", height: "40%", background: "linear-gradient(180deg, transparent, var(--floor-shade))", pointerEvents: "none" }} />
      </div>
    </div>
  );
}
