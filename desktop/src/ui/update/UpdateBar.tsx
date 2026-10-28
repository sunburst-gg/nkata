// The one line that says a newer Nkata is ready (src-tauri/src/updates.rs downloads it in the
// background). It stays until Restart: an update should not vanish like a toast. Restart closes
// the window and opens the new version; the folder keeps syncing from where it was.
import { useEffect, useState } from "react";
import { updates } from "@/lib/tauri";

const EVERY_MS = 60_000;

export function UpdateBar() {
  const [version, setVersion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const look = () => void updates.ready().then((v) => { if (live) setVersion(v); }, () => undefined);
    look();
    const id = window.setInterval(look, EVERY_MS);
    return () => { live = false; window.clearInterval(id); };
  }, []);
  if (!version) return null;
  const restart = () => {
    setBusy(true);
    setProblem(null);
    updates.restart().catch((e: unknown) => { setBusy(false); setProblem(e instanceof Error ? e.message : String(e)); });
  };
  return (
    <div role="status" style={{ position: "fixed", right: 24, bottom: 24, zIndex: 60, display: "flex", alignItems: "center", gap: 14, padding: "8px 8px 8px 16px", borderRadius: "var(--r-12)", background: "var(--toast-bg)", color: "var(--toast-fg)", boxShadow: "var(--shadow-lift)", font: "400 14px var(--sans)", animation: "nk-rise var(--t-panel) var(--ease)" }}>
      <span>{problem ? `Nkata ${version} did not install. ${problem}` : `Nkata ${version} is ready.`}</span>
      <button type="button" onClick={restart} disabled={busy} style={{ height: 32, padding: "0 14px", borderRadius: "var(--r-6)", border: 0, background: "var(--amber)", color: "var(--amber-fg)", font: "500 14px var(--sans)", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
        {busy ? "Restarting" : "Restart"}
      </button>
    </div>
  );
}
