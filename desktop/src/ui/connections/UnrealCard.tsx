// Unreal Engine. With the server's Unreal mirror off (UNREAL_ENABLED, Decisions 19) one card,
// "Coming soon", as the prototype's CONNECTIONS block. With it on (v8 step 18): the Unreal
// project inside the place on this computer, and Connect, which installs the plugin with Python
// and Remote Control on. The saves then arrive in the editor by themselves.
import { useEffect, useState } from "react";
import { useStore } from "@/app/store";
import { LiveDataSource } from "@/data/live/LiveDataSource";
import { toast } from "@/ui/toast/toast";

const cta: React.CSSProperties = { height: 36, padding: "0 16px", borderRadius: "var(--r-6)", border: 0, background: "var(--amber)", color: "var(--amber-fg)", font: "500 14px var(--sans)", cursor: "pointer", whiteSpace: "nowrap" };
const line: React.CSSProperties = { fontSize: 13, color: "var(--ink60)" };

function UnrealLogo() {
  return (
    <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: "var(--r-12)", background: "var(--raised)", boxShadow: "var(--shadow)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--ink)", flexShrink: 0 }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.5C6.2 1.5 1.5 6.2 1.5 12S6.2 22.5 12 22.5 22.5 17.8 22.5 12 17.8 1.5 12 1.5zm0 1.6c4.9 0 8.9 4 8.9 8.9s-4 8.9-8.9 8.9-8.9-4-8.9-8.9S7.1 3.1 12 3.1zM10.2 6.3c-2.3.9-4.1 3-4.6 5.5.6-.6 1.3-1 2-1.3v3.3c0 1.6 1 2.6 2.5 3.2 1.1.4 2.3.5 3.5.2l1.5 1.4 3.1-3.6-1.1-.4c-.4.7-1 1.2-1.7 1.5V8.5c0-.6.3-1 .8-1.3-1.3-.4-2.7-.3-3.9.3v7.1c-.4.1-.9 0-1.3-.1V7.6c-.3-.5-.6-.9-.8-1.3z" /></svg>
    </span>
  );
}

export function UnrealCard() {
  const source = useStore((s) => s.source);
  const projectId = useStore((s) => s.projectId);
  const me = useStore((s) => s.me);
  const live = source instanceof LiveDataSource ? source : null;
  const on = !!live?.unrealEnabled();
  const placed = !!live && !!projectId && !!live.projectFolder(projectId);
  const [found, setFound] = useState<string[] | null>(null);
  const [connected, setConnected] = useState(() => !!live?.unrealConnectedBefore());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!live || !on || !placed) return;
    void live.detectUnreal().then(setFound, (e: unknown) => toast(e instanceof Error ? e.message : String(e), "var(--bad)"));
  }, [live, on, placed]);
  if (!on) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "20px 0", borderTop: "1px solid var(--line)", opacity: .6 }}>
        <UnrealLogo />
        <span style={{ fontWeight: 500, color: "var(--ink)", flex: 1 }}>Unreal Engine</span>
        <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: "var(--r-6)", background: "var(--hover)", color: "var(--ink60)" }}>Coming soon</span>
      </div>
    );
  }
  const uproject = found?.[0] ?? null;
  const name = uproject?.split(/[\\/]/).pop()?.replace(/\.uproject$/, "") ?? "";
  const connect = async () => {
    if (!live || !uproject || busy) return;
    setBusy(true);
    try {
      await live.connectUnreal(uproject);
      setConnected(true);
      toast(`${name} is connected. Open it in Unreal, or restart it if it is open.`, me?.color ?? "var(--ok)");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "var(--bad)");
    } finally {
      setBusy(false);
    }
  };
  const text = !placed ? "Put the project on this computer first."
    : found === null ? "Looking for the Unreal project."
      : !uproject ? "No Unreal project in the project's folder. Put the .uproject inside it."
        : connected ? `${name}. Every save in Blender arrives in the editor.`
          : `${name}, in the project's folder.`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "20px 0", borderTop: "1px solid var(--line)" }}>
      <UnrealLogo />
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 500, color: "var(--ink)" }}>Unreal Engine</span>
        <span style={line}>{text}</span>
      </div>
      {uproject && !connected ? <button type="button" disabled={busy} onClick={() => void connect()} style={cta}>Connect Unreal</button> : null}
    </div>
  );
}
