import { useStore } from "@/app/store";
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
            Connections<span aria-label="Everything works" style={{ marginLeft: "auto", width: 7, height: 7, borderRadius: "50%", background: "var(--ok)" }} />
          </NavItem>
        ) : null}
        <MeRow />
      </div>
    </aside>
  );
}
