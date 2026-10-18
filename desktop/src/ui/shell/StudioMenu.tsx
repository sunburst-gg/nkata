// The studio menu: Settings, Invite people, the Training line with its switch (leads only),
// Log out. A Radix DropdownMenu restyled to the tokens.
import * as Menu from "@radix-ui/react-dropdown-menu";
import { useStore } from "@/app/store";
import { useCan } from "@/auth/useCan";
import { toast } from "@/ui/toast/toast";

const item: React.CSSProperties = { height: 36, display: "flex", alignItems: "center", padding: "0 10px", borderRadius: "var(--r-6)", cursor: "pointer", outline: "none", fontSize: 15, color: "var(--ink)" };

export function StudioMenu() {
  const studio = useStore((s) => s.studio);
  const source = useStore((s) => s.source);
  const refresh = useStore((s) => s.refresh);
  const go = useStore((s) => s.go);
  const me = useStore((s) => s.me);
  const canTraining = useCan("setTraining");
  const canInvite = useCan("invite");
  const training = studio?.training ?? true;
  const toggleTraining = async () => { await source?.setTraining(!training); await refresh(); };
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <button type="button" className="nk-nav" aria-label="Studio menu" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: "var(--r-6)", border: 0, background: "transparent", width: "100%", textAlign: "left", font: "inherit" }}>
          <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: "var(--r-6)", background: "var(--swatch-2)", color: "var(--on-color)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600 }}>{(studio?.name ?? "N").charAt(0)}</span>
          <span style={{ fontWeight: 500, color: "var(--ink)" }}>{studio?.name ?? "Nkata"}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--ink40)" }} aria-hidden="true"><path d="M3 4.5l3 3 3-3" /></svg>
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="start" sideOffset={6} style={{ width: 272, background: "var(--raised)", borderRadius: "var(--r-12)", boxShadow: "var(--shadow-lift)", padding: 6, display: "flex", flexDirection: "column", zIndex: 30, animation: "nk-rise var(--t-fast) var(--ease)" }}>
          <Menu.Item className="nk-menu-item" style={item} onSelect={() => go("settings")}>Settings</Menu.Item>
          {canInvite ? <Menu.Item className="nk-menu-item" style={item} onSelect={() => useStore.setState({ inviteOpen: true })}>Invite people</Menu.Item> : null}
          {canTraining ? (
            <>
              <Menu.Separator style={{ height: 1, background: "var(--line)", margin: "6px 4px" }} />
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "8px 10px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>Training</span>
                  <span style={{ fontSize: 12, color: "var(--ink60)", lineHeight: 1.4 }}>{training ? `On. ${studio?.name ?? "The studio"} helps train Nok with this project. Names are never attached.` : "Off. Billed per seat."}</span>
                </div>
                <button type="button" role="switch" aria-checked={training} aria-label="Training" onClick={() => void toggleTraining()} style={{ marginTop: 2, width: 32, height: 18, borderRadius: 9, border: 0, padding: 0, background: training ? "var(--amber)" : "var(--ink40)", position: "relative", cursor: "pointer", flexShrink: 0, transition: "background var(--t-fast)" }}>
                  <span aria-hidden="true" style={{ position: "absolute", top: 2, left: training ? 16 : 2, width: 14, height: 14, borderRadius: "50%", background: "var(--on-color)", transition: "left var(--t-fast)" }} />
                </button>
              </div>
            </>
          ) : null}
          <Menu.Separator style={{ height: 1, background: "var(--line)", margin: "6px 4px" }} />
          <Menu.Item className="nk-menu-item" style={item} onSelect={() => toast(`Logged out. See you, ${me?.first ?? "friend"}.`, me?.color ?? "var(--ok)")}>Log out</Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
