// Nkata itself, as slim full-width lines at the top of every screen. Agent not running: one
// line with Restart. Offline: one line, no button, clears by itself. Paused: on the wall only,
// with Resume (BlenderCard owns the state; this draws the line).
import { useStore } from "@/app/store";
import { toast } from "@/ui/toast/toast";

const bar: React.CSSProperties = { height: 40, flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "0 40px", fontSize: 13, color: "var(--ink)", background: "var(--hover)", borderBottom: "1px solid var(--line)" };
const button: React.CSSProperties = { height: 32, padding: "0 10px", borderRadius: "var(--r-6)", border: 0, background: "var(--raised)", boxShadow: "var(--shadow)", color: "var(--ink)", font: "500 12px var(--sans)", cursor: "pointer" };

export function StatusLine() {
  const agentRunning = useStore((s) => s.agentRunning);
  const online = useStore((s) => s.online);
  const source = useStore((s) => s.source);
  if (agentRunning && online) return null;
  return (
    <div role="status" style={{ display: "flex", flexDirection: "column" }}>
      {!agentRunning ? (
        <div style={bar}>
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--bad)" }} />
          <span style={{ flex: 1 }}>Nkata is not running in the background. Restart it.</span>
          <button type="button" onClick={() => void source?.restartAgent()} style={button}>Restart</button>
        </div>
      ) : null}
      {!online ? (
        <div style={bar}>
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", border: "1.5px solid var(--ink40)", boxSizing: "border-box" }} />
          <span style={{ flex: 1 }}>Offline. Changes go out when you are back.</span>
        </div>
      ) : null}
    </div>
  );
}

/** The wall's paused line: the same words as the card, with Resume. */
export function PausedLine() {
  const paused = useStore((s) => s.blender.kind === "paused");
  const source = useStore((s) => s.source);
  const me = useStore((s) => s.me);
  const refresh = useStore((s) => s.refresh);
  if (!paused || !source || !me) return null;
  return (
    <div role="status" style={{ ...bar, margin: "0 -40px", borderTop: "1px solid var(--line)" }}>
      <span aria-label="Paused" style={{ width: 7, height: 7, borderRadius: "50%", border: "1.5px solid var(--ink40)", boxSizing: "border-box" }} />
      <span style={{ flex: 1 }}>Paused. Saves stay on this computer until you resume.</span>
      <button type="button" onClick={() => { void source.resume().then(refresh); toast("Resumed. Saves go out again.", me.color); }} style={button}>Resume</button>
    </div>
  );
}
