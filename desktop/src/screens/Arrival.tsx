// Arrival, before the shell: who invited you, the project, the faces, one button. Everyone but a
// viewer gets the self-ticking setup list: the Blender card (the same card as Connections, so
// first run and Connections never disagree) and the project row, each moved by DataSource events.
// Viewers land straight on the asset they were sent. The mock keeps the prototype's words; on
// live data the studio, the project and the people are the real ones.
import { useEffect } from "react";
import { useStore } from "@/app/store";
import { isViewer } from "@/auth/permissions";
import { useCan } from "@/auth/useCan";
import { PEOPLE } from "@/data/mock";
import type { MockDataSource } from "@/data/mock";
import { LiveDataSource } from "@/data/live/LiveDataSource";
import { Mark } from "@/ui/stage/Mark";
import { GHOST_MODEL } from "@/ui/stage/GhostStage";
import { NkViewer } from "@/viewer/NkViewer";
import { BlenderCard } from "@/ui/connections/BlenderCard";
import { PlaceProjectRow } from "@/ui/connections/PlaceProjectRow";

export function Arrival() {
  const me = useStore((s) => s.me);
  const source = useStore((s) => s.source);
  const setupDone = useStore((s) => s.setupDone);
  const blender = useStore((s) => s.blender);
  const go = useStore((s) => s.go);
  const studio = useStore((s) => s.studio);
  const projects = useStore((s) => s.projects);
  const projectId = useStore((s) => s.projectId);
  const members = useStore((s) => s.members);
  const viewer = !!me && isViewer(me.role);
  const setup = useCan("seeSetup");
  useEffect(() => { if (setup && source && "startArrivalSetup" in source) (source as MockDataSource).startArrivalSetup(); }, [setup, source]);
  if (!me) return null;
  const live = source instanceof LiveDataSource;
  const done = (blender.kind === "connected" || blender.kind === "open") && setupDone.includes("project");
  const projectReady = setupDone.includes("project") || (live && !!projectId && !!source?.projectFolder(projectId));
  const project = projects.find((p) => p.id === projectId);
  const projectName = live ? (project?.name ?? studio?.name ?? "your project") : "Rising Sun";
  const others = members.map((m) => m.person).filter((p) => p.id !== me.id);
  const people = live ? others.slice(0, 4) : (["E", "C", "N", "T"] as const).map((k) => PEOPLE[k]);
  const names = (list: readonly { first: string }[]) => list.map((p) => p.first).reduce((acc, n, i, all) => (i === 0 ? n : i === all.length - 1 ? `${acc} and ${n}` : `${acc}, ${n}`), "");
  const title = viewer ? "Njoku wants you to look at Market stall." : done ? `You are set, ${me.first}.` : live ? `Welcome to ${projectName}, ${me.first}.` : "Emeka invited you to Rising Sun.";
  const line = viewer ? "Nothing to install. The model turns, you click it, you say what you see."
    : live ? `${studio?.name ?? "Your studio"}. Connect Blender and every save shows up here for the team.`
      : `A 1960s Nigeria story by ${studio?.name ?? "Sunburst"}. Four people are in it already.`;
  const teamLine = viewer ? "Njoku, Chidi, Ngozi and Tobe are in it" : live ? (others.length ? `${names(others)} ${others.length === 1 ? "is" : "are"} in it` : "You are the first one in it") : "Emeka, Chidi, Ngozi and Tobe";
  return (
    <div style={{ minHeight: "100vh", minWidth: 1280, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", alignItems: "stretch", background: "var(--canvas)" }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "64px 72px", gap: 32 }}>
        <Mark size={28} />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h1 style={{ margin: 0, font: "400 var(--t-40)/1.1 var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)" }}>{title}</h1>
          <span style={{ fontSize: 15, color: "var(--ink60)", lineHeight: 1.55, maxWidth: 420 }}>{line}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", paddingLeft: 8 }}>{people.map((p) => { return <span key={p.id} aria-label={p.name} style={{ width: 32, height: 32, borderRadius: "50%", background: p.color, color: "var(--on-color)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, border: "2px solid var(--canvas)", marginLeft: -8 }}>{p.initial}</span>; })}</div>
          <span style={{ fontSize: 13, color: "var(--ink60)" }}>{teamLine}</span>
        </div>
        {setup ? (
          <div style={{ display: "flex", flexDirection: "column", paddingTop: 8, maxWidth: 520 }} aria-label="Setup">
            <BlenderCard compact />
            {live ? (project ? <PlaceProjectRow projectId={project.id} name={project.name} done={projectReady} /> : null) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid var(--line)" }}>
              <span aria-label={projectReady ? "done" : "pending"} style={{ width: 20, height: 20, borderRadius: "50%", background: projectReady ? "var(--ok)" : "transparent", border: `1.5px solid ${projectReady ? "var(--ok)" : "var(--line)"}`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background var(--t-panel)" }}>
                {projectReady ? <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="var(--on-color)" strokeWidth="2.5" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" /></svg> : null}
              </span>
              <span style={{ color: "var(--ink80)" }}>{projectName} ready on this computer</span>
              {projectReady ? <button type="button" onClick={() => void source?.showInFinder("rising-sun")} style={{ marginLeft: "auto", border: 0, background: "transparent", padding: 0, font: "400 var(--t-11) var(--mono)", color: "var(--ink40)", cursor: "pointer" }}>Show in Finder</button> : null}
            </div>
            )}
          </div>
        ) : null}
        <button type="button" onClick={() => (viewer ? go("asset", { projectId: "try-nkata", assetId: "try-nkata/market-stall" }) : go("project"))} style={{ alignSelf: "flex-start", height: 44, padding: "0 22px", borderRadius: "var(--r-6)", border: 0, background: "var(--amber)", color: "var(--amber-fg)", font: "500 15px var(--sans)", cursor: "pointer", boxShadow: "var(--shadow)" }}>{viewer ? "Look at it" : "Join Rising Sun"}</button>
      </div>
      <div style={{ position: "relative", background: "linear-gradient(180deg, var(--stage-top), var(--stage-bot))", overflow: "hidden" }}>
        <NkViewer src={GHOST_MODEL} ghost={live} autorotate={0.5} style={{ position: "absolute", inset: 0 }} />
        <div aria-hidden="true" style={{ position: "absolute", inset: "auto 0 0 0", height: "40%", background: "linear-gradient(180deg, transparent, var(--floor-shade))", pointerEvents: "none" }} />
      </div>
    </div>
  );
}
