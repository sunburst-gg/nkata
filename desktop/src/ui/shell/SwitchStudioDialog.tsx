// Switch studio: rows with the mark, the name, "{role} · {n} projects", a check on the current
// one. Picking a row moves the whole app into that studio. Then New studio.
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { useStore } from "@/app/store";
import { ROLE_WORD } from "@/auth/permissions";
import type { StudioRef } from "@/data/types";

export function SwitchStudioDialog() {
  const open = useStore((s) => s.switchOpen);
  const source = useStore((s) => s.source);
  const [studios, setStudios] = useState<StudioRef[]>([]);
  useEffect(() => { if (open && source) void source.listStudios().then(setStudios); }, [open, source]);
  const close = () => useStore.setState({ switchOpen: false });
  const pick = async (st: StudioRef) => {
    if (!source) return;
    await source.switchStudio(st.id);
    const me = useStore.getState().me;
    if (me) useStore.setState({ me: { ...me, role: st.role } });
    useStore.setState({ projectId: null, assetId: null, switchOpen: false });
    await useStore.getState().refresh();
    useStore.setState({ screen: useStore.getState().projects.length ? "project" : "zeroProject" });
  };
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 40 }} />
        <Dialog.Content aria-describedby={undefined} style={{ position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: 420, background: "var(--raised)", borderRadius: "var(--r-16)", boxShadow: "var(--shadow-lift)", padding: 28, display: "flex", flexDirection: "column", gap: 16, zIndex: 41, outline: "none", animation: "nk-rise var(--t-panel) var(--ease)" }}>
          <Dialog.Title style={{ margin: 0, font: "400 var(--t-28) var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)" }}>Switch studio</Dialog.Title>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {studios.map((st) => (
              <button key={st.id} type="button" onClick={() => void pick(st)} className="nk-nav" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", margin: "0 -8px", borderRadius: "var(--r-6)", border: 0, background: "transparent", textAlign: "left", font: "inherit", cursor: "pointer" }}>
                <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: "var(--r-6)", background: "var(--swatch-2)", color: "var(--on-color)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600 }}>{st.name.charAt(0)}</span>
                <div style={{ display: "flex", flexDirection: "column", flex: 1 }}><span style={{ color: "var(--ink)" }}>{st.name}</span><span style={{ fontSize: 13, color: "var(--ink60)" }}>{ROLE_WORD[st.role]} · {st.projects} project{st.projects === 1 ? "" : "s"}</span></div>
                {st.current ? <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--ink)" strokeWidth="2" aria-label="Current"><path d="M3 8.5l3.2 3L13 4.5" /></svg> : null}
              </button>
            ))}
            {studios.length <= 1 ? <span style={{ fontSize: 13, color: "var(--ink60)", padding: "8px 0" }}>This is your only studio. Invites to other studios show up here.</span> : null}
          </div>
          <span style={{ height: 1, background: "var(--line)" }} />
          <button type="button" onClick={() => { close(); useStore.setState({ screen: "zeroStudio" }); }} style={{ alignSelf: "flex-start", border: 0, background: "transparent", padding: 0, font: "400 15px var(--sans)", color: "var(--ink)", cursor: "pointer" }}>New studio</button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
