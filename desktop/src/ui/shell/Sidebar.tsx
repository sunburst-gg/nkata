import { useStore } from "@/app/store";
import { dot, line } from "@/app/connection";
import { useCan } from "@/auth/useCan";
import { Breadcrumbs } from "./Breadcrumbs";
import { JourneyRow } from "./JourneyRow";
import { MeRow } from "./MeRow";
import { NavItem } from "./NavItem";
import { ProjectList } from "./ProjectList";
import { StudioMenu } from "./StudioMenu";

export { Breadcrumbs };

export function Sidebar() {
  const screen = useStore((s) => s.screen);
  const go = useStore((s) => s.go);
  const mentionCount = useStore((s) => s.mentions.length);
  const canConnections = useCan("seeConnections");
  const blender = useStore((s) => s.blender);
  const agentRunning = useStore((s) => s.agentRunning);
  const online = useStore((s) => s.online);
  const me = useStore((s) => s.me);
  // The dot: green when everything works, hollow neutral when paused, red when an action is needed.
  const why = !agentRunning ? "Nkata is not running in the background." : !online ? "Offline. Changes go out when you are back." : line(blender);
  const tone = !agentRunning ? "action" : !online ? "paused" : dot(blender);
  return (
    <aside style={{ width: 248, flexShrink: 0, display: "flex", flexDirection: "column", padding: "20px 12px", gap: 2 }}>
      <div style={{ position: "relative", marginBottom: 16 }}><StudioMenu /></div>
      <JourneyRow />
      <NavItem active={screen === "mentions"} onClick={() => go("mentions")}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="8" cy="8" r="2.5" /><path d="M10.5 8v1a1.75 1.75 0 003.5 0V8a6 6 0 10-2.3 4.7" /></svg>
        Mentions
        {mentionCount > 0 ? <span style={{ marginLeft: "auto", font: "400 var(--t-11) var(--mono)", color: "var(--ink60)" }}>{mentionCount}</span> : null}
      </NavItem>
      <ProjectList />
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {canConnections ? (
          <NavItem active={screen === "connections"} onClick={() => go("connections")}>
            Connections<span title={why} aria-hidden="true" style={{ marginLeft: "auto", width: 7, height: 7, borderRadius: "50%", boxSizing: "border-box", background: tone === "ok" ? "var(--ok)" : tone === "live" ? (me?.color ?? "var(--ok)") : tone === "action" ? "var(--bad)" : "transparent", border: tone === "paused" ? "1.5px solid var(--ink40)" : 0, animation: tone === "live" ? "nk-breathe 2.4s var(--ease) infinite" : undefined }} />
          </NavItem>
        ) : null}
        <MeRow />
      </div>
    </aside>
  );
}
