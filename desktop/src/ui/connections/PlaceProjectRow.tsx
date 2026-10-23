// The project on this computer, the second line of the setup list and the empty line of On this
// computer. Until it has a place: where it will live, in mono, and one button. After: a tick and
// the place. Saves into that place reach the team; nothing outside it does.
import { useState } from "react";
import { useStore } from "@/app/store";
import { inTauri } from "@/lib/tauri";
import { toast } from "@/ui/toast/toast";

export function PlaceProjectRow({ projectId, name, done }: { projectId: string; name: string; done: boolean }) {
  const source = useStore((s) => s.source);
  const me = useStore((s) => s.me);
  const placed = source?.projectFolder(projectId) ?? null;
  // The default follows the project's name, which can arrive after the first render; a place the
  // person picked stays.
  const [picked, setPicked] = useState<string | null>(null);
  const at = picked ?? `~/Nkata/${name}`;
  const [busy, setBusy] = useState(false);
  const place = async () => {
    if (!source || busy) return;
    setBusy(true);
    try {
      await source.placeProject(projectId, at);
      toast(`${name} is in ${at}. Save your .blend files there.`, me?.color ?? "var(--ok)");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "var(--bad)");
    } finally {
      setBusy(false);
    }
  };
  // The native picker: what the person picks is where the project lives.
  // https://v2.tauri.app/plugin/dialog/
  const choose = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const chosen = await open({ directory: true, multiple: false });
    if (typeof chosen === "string") setPicked(chosen);
  };
  const isDone = done || !!placed;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid var(--line)" }}>
      <span aria-label={isDone ? "done" : "pending"} style={{ width: 20, height: 20, borderRadius: "50%", background: isDone ? "var(--ok)" : "transparent", border: `1.5px solid ${isDone ? "var(--ok)" : "var(--line)"}`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {isDone ? <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="var(--on-color)" strokeWidth="2.5" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" /></svg> : null}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ color: "var(--ink80)" }}>{isDone ? `${name} is on this computer` : `${name} on this computer`}</span>
        <span style={{ font: "400 var(--t-11) var(--mono)", color: "var(--ink40)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{isDone ? (placed ?? at) : at}</span>
      </div>
      {isDone ? null : (
        <>
          {inTauri() ? <button type="button" onClick={() => void choose()} style={{ border: 0, background: "transparent", padding: 0, font: "400 13px var(--sans)", color: "var(--ink60)", textDecoration: "underline", cursor: "pointer", whiteSpace: "nowrap" }}>Choose another place</button> : null}
          <button type="button" disabled={busy} onClick={() => void place()} style={{ height: 32, padding: "0 12px", borderRadius: "var(--r-6)", border: 0, background: "var(--amber)", color: "var(--amber-fg)", font: "500 13px var(--sans)", cursor: "pointer", whiteSpace: "nowrap" }}>Put it here</button>
        </>
      )}
    </div>
  );
}
