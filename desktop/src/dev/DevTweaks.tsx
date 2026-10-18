// Dev builds only: the prototype's Tweaks panel. A change reseeds the mock like sync() does;
// simulateSave and simulateJoin go through the mock's event stream. Live contexts n / 8 reads
// the viewer pool (step 4). Never in a production build: main.tsx mounts it under import.meta.env.DEV.
import { useEffect, useState } from "react";
import { useStore } from "@/app/store";
import { STAGES, TWEAK_ROLES, type MockDataSource } from "@/data/mock";
import { BLENDER_TWEAKS, START_SCREENS, tweaksToSearch, type Tweaks } from "./tweaks";
import { toast } from "@/ui/toast/toast";

declare global { interface Window { __nkataPool?: { length: number } } }

const field: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, font: "400 var(--t-11) var(--mono)", color: "var(--ink60)" };
const select: React.CSSProperties = { font: "400 var(--t-11) var(--mono)", color: "var(--ink)", background: "var(--canvas)", border: "1px solid var(--line)", borderRadius: "var(--r-6)", height: 22, padding: "0 4px" };

export function DevTweaks({ mock, tweaks, onChange }: { mock: MockDataSource; tweaks: Tweaks; onChange: (t: Tweaks) => void }) {
  // Gone under automation (the shots harness) so the screenshots show the app alone.
  const [open, setOpen] = useState(true);
  const automated = typeof navigator !== "undefined" && navigator.webdriver;
  const [live, setLive] = useState(0);
  const theme = useStore((s) => s.theme);
  useEffect(() => { const t = setInterval(() => setLive(window.__nkataPool?.length ?? 0), 500); return () => clearInterval(t); }, []);
  const set = (patch: Partial<Tweaks>) => { const next = { ...tweaks, ...patch }; history.replaceState(null, "", `${location.pathname}${tweaksToSearch(next)}`); onChange(next); };
  if (automated) return null;
  if (!open) return <button type="button" onClick={() => setOpen(true)} style={{ position: "fixed", right: 12, bottom: 12, zIndex: 50, ...select }}>Tweaks</button>;
  return (
    <div style={{ position: "fixed", right: 12, bottom: 12, zIndex: 50, width: 220, display: "flex", flexDirection: "column", gap: 6, padding: 10, borderRadius: "var(--r-12)", background: "var(--raised)", boxShadow: "var(--shadow-lift)", border: "1px solid var(--line)" }}>
      <div style={{ ...field, color: "var(--ink)" }}><span>Tweaks</span><button type="button" onClick={() => setOpen(false)} style={{ ...select, height: 18 }}>hide</button></div>
      <label style={field}>role<select style={select} value={tweaks.role} onChange={(e) => set({ role: e.target.value as Tweaks["role"] })}>{TWEAK_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
      <label style={field}>stage<select style={select} value={tweaks.stage} onChange={(e) => set({ stage: e.target.value as Tweaks["stage"] })}>{STAGES.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
      <label style={field}>startScreen<select style={select} value={tweaks.startScreen} onChange={(e) => set({ startScreen: e.target.value as Tweaks["startScreen"] })}>{START_SCREENS.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
      <label style={field}>theme<select style={select} value={theme} onChange={(e) => set({ theme: e.target.value as Tweaks["theme"] })}>{["light", "dark"].map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
      <label style={field}>blender<select style={select} value={tweaks.blender} onChange={(e) => set({ blender: e.target.value as Tweaks["blender"] })}>{BLENDER_TWEAKS.map((r) => <option key={r} value={r}>{r || "(stage)"}</option>)}</select></label>
      <div style={field}><span>agent</span><button type="button" style={select} onClick={() => mock.setAgent(!useStore.getState().agentRunning)}>toggle</button></div>
      <div style={field}><span>offline</span><button type="button" style={select} onClick={() => mock.setOnline(!useStore.getState().online)}>toggle</button></div>
      <div style={field}><span>simulateSave</span><button type="button" style={select} onClick={() => void mock.simulateSave()}>fire</button></div>
      <div style={field}><span>simulateJoin</span><button type="button" style={select} onClick={() => void mock.simulateJoin()}>fire</button></div>
      <div style={field}><span>test toast</span><button type="button" style={select} onClick={() => toast("Ada saved Market stall.", "var(--p-terracotta)", { thumb: "/fixtures/renders/compound-ground.png", go: () => useStore.getState().go("asset", { assetId: useStore.getState().assets[0]?.id ?? null }) })}>fire</button></div>
      <div style={field}><span>live contexts</span><span>{live} / 8</span></div>
    </div>
  );
}
