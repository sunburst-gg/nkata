// The Blender card: one line that says what is true and the one action that fixes it, for each
// of the ten states in app/connection.ts. The same card sits in the Arrival setup list
// (compact). Paths never appear in the line; the file name is a mono detail.
import * as Menu from "@radix-ui/react-dropdown-menu";
import { useStore } from "@/app/store";
import { line, primary, type BlenderState } from "@/app/connection";
import type { BlenderInstall } from "@/data/types";
import { toast } from "@/ui/toast/toast";

const item: React.CSSProperties = { height: 36, display: "flex", alignItems: "center", padding: "0 10px", borderRadius: "var(--r-6)", cursor: "pointer", outline: "none", fontSize: 15, color: "var(--ink)" };
const cta: React.CSSProperties = { height: 36, padding: "0 16px", borderRadius: "var(--r-6)", border: 0, background: "var(--amber)", color: "var(--amber-fg)", font: "500 14px var(--sans)", cursor: "pointer", whiteSpace: "nowrap" };
const quiet: React.CSSProperties = { height: 36, padding: "0 12px", borderRadius: "var(--r-6)", border: 0, background: "var(--raised)", boxShadow: "var(--shadow)", color: "var(--ink)", font: "500 13px var(--sans)", cursor: "pointer", whiteSpace: "nowrap" };
const link: React.CSSProperties = { border: 0, background: "transparent", padding: 0, font: "400 13px var(--sans)", color: "var(--ink60)", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 };

export function BlenderLogo() {
  return (
    <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: "var(--r-12)", background: "var(--raised)", boxShadow: "var(--shadow)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="var(--blender)"><path d="M12.5 2.6c-.6 0-1.1.2-1.5.5L2.9 9.4c-.9.7-.9 1.8 0 2.4l2.9 2.1-2.5 1.9c-.8.6-.8 1.6 0 2.2l3.4 2.5c1.6 1.2 3.5 1.9 5.6 1.9 5.2 0 9.4-3.8 9.4-8.5 0-2.5-1.2-4.8-3.1-6.3L14 3.1c-.4-.3-1-.5-1.5-.5zm-.2 7.4c2.5 0 4.5 1.8 4.5 4s-2 4-4.5 4-4.5-1.8-4.5-4 2-4 4.5-4z" /></svg>
    </span>
  );
}

/** The dot before the status: green, breathing in my color, hollow when paused, red when an action is needed. */
export function StatusDot({ blender: b, color }: { blender: BlenderState; color: string }) {
  if (b.kind === "open") return <span aria-label="In Blender now" style={{ width: 7, height: 7, borderRadius: "50%", background: color, animation: "nk-breathe 2.4s var(--ease) infinite", flexShrink: 0 }} />;
  if (b.kind === "connected") return <span aria-label="Connected" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--ok)", flexShrink: 0 }} />;
  if (b.kind === "paused") return <span aria-label="Paused" style={{ width: 7, height: 7, borderRadius: "50%", border: "1.5px solid var(--ink40)", boxSizing: "border-box", flexShrink: 0 }} />;
  return <span aria-label="Needs you" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--bad)", flexShrink: 0 }} />;
}

export function BlenderCard({ compact = false }: { compact?: boolean }) {
  const b = useStore((s) => s.blender);
  const source = useStore((s) => s.source);
  const me = useStore((s) => s.me);
  const refresh = useStore((s) => s.refresh);
  if (!source || !me) return null;
  const act = primary(b);
  const run = async () => {
    if (!act) return;
    if (act.action === "pickBlender") { await source.pickBlender(); return; }
    if (act.action === "connect") { await source.connectBlender(); toast("Blender is connected. Press N in the viewport for the Nkata panel.", me.color); }
    if (act.action === "update") { await source.updateAddon(); }
    if (act.action === "reconnect") { await source.reconnectBlender(); toast("Blender is talking to Nkata again.", me.color); }
    if (act.action === "resume") { await source.resume(); toast("Resumed. Saves go out again.", me.color); }
    await refresh();
  };
  const pick = async (install: BlenderInstall) => { await source.pickBlender(install); await refresh(); };
  const detail = b.kind === "open" || b.kind === "lost" ? b.file : b.kind === "connected" && b.restart ? `Blender ${b.version}. Add-on ${b.addon}.` : null;
  const second = b.kind === "lost" ? "Your work is safe in the file." : null;
  return (
    <div data-blender={b.kind} style={{ display: "flex", alignItems: "center", gap: 16, padding: compact ? "12px 0" : "20px 0", borderTop: "1px solid var(--line)" }}>
      <BlenderLogo />
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 500, color: "var(--ink)" }}>Blender</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink60)", flexWrap: "wrap" }}>
          <StatusDot blender={b} color={me.color} />
          <span>{line(b)}</span>
          {detail ? <span style={{ font: "400 var(--t-11) var(--mono)", color: "var(--ink40)" }}>{detail}</span> : null}
        </span>
        {second ? <span style={{ fontSize: 13, color: "var(--ink60)" }}>{second}</span> : null}
        {b.kind === "several" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 6 }} aria-label="Pick a Blender">
            {b.found.map((f) => (
              <button key={f.path} type="button" onClick={() => void pick(f)} className="nk-nav" style={{ display: "flex", alignItems: "center", gap: 10, height: 32, padding: "0 8px", margin: "0 -8px", borderRadius: "var(--r-6)", border: 0, background: "transparent", font: "inherit", color: "var(--ink)", cursor: "pointer", textAlign: "left" }}>
                <span>Blender {f.version}</span>
                <span style={{ font: "400 var(--t-11) var(--mono)", color: "var(--ink40)" }}>{f.path.split("/").pop()}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {act ? <button type="button" onClick={() => void run()} style={cta}>{act.label}</button> : null}
      {b.kind === "notFound" ? <a href="https://www.blender.org/download/" target="_blank" rel="noreferrer" style={link}>Get Blender</a> : null}
      {b.kind === "unsupported" ? <button type="button" onClick={() => void source.pickBlender()} style={link}>Find another Blender</button> : null}
      {b.kind === "connected" && !compact ? <button type="button" onClick={() => void source.openBlender().then(refresh)} style={quiet}>Open Blender</button> : null}
      {(b.kind === "connected" || b.kind === "open" || b.kind === "lost") && !compact ? (
        <Menu.Root>
          <Menu.Trigger asChild>
            <button type="button" className="nk-nav" aria-label="Blender menu" style={{ width: 32, height: 32, borderRadius: "var(--r-6)", border: 0, background: "transparent", color: "var(--ink60)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="8" r="1.4" /><circle cx="8" cy="8" r="1.4" /><circle cx="13" cy="8" r="1.4" /></svg>
            </button>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content align="end" sideOffset={4} style={{ width: 180, background: "var(--raised)", borderRadius: "var(--r-12)", boxShadow: "var(--shadow-lift)", padding: 6, zIndex: 30, animation: "nk-rise var(--t-fast) var(--ease)" }}>
              <Menu.Item className="nk-menu-item" style={item} onSelect={() => { void source.pause().then(refresh); toast("Paused. Saves stay on this computer.", me.color); }}>Pause</Menu.Item>
              <Menu.Item className="nk-menu-item" style={item} onSelect={() => useStore.setState({ disconnectOpen: true })}>Disconnect</Menu.Item>
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
      ) : null}
    </div>
  );
}
