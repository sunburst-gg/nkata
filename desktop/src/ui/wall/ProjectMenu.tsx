// The project title menu on the wall: a quiet chevron after the name that opens Project
// settings. The prototype has no menu here; logged in docs/decisions.md (step 8).
import * as Menu from "@radix-ui/react-dropdown-menu";
import { MenuRoot, MenuTrigger } from "@/ui/menu/Menu";
import { useStore } from "@/app/store";

const item: React.CSSProperties = { height: 36, display: "flex", alignItems: "center", padding: "0 10px", borderRadius: "var(--r-6)", cursor: "pointer", outline: "none", fontSize: 15, color: "var(--ink)" };

export function ProjectMenu() {
  const go = useStore((s) => s.go);
  return (
    <MenuRoot>
      <MenuTrigger>
        <button type="button" className="nk-nav" aria-label="Project menu" style={{ width: 32, height: 32, borderRadius: "var(--r-6)", border: 0, background: "transparent", color: "var(--ink40)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", marginBottom: 6 }}>
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 4.5l3 3 3-3" /></svg>
        </button>
      </MenuTrigger>
      <Menu.Portal>
        <Menu.Content align="start" sideOffset={4} style={{ width: 200, background: "var(--raised)", borderRadius: "var(--r-12)", boxShadow: "var(--shadow-lift)", padding: 6, display: "flex", flexDirection: "column", zIndex: 30, animation: "nk-rise var(--t-fast) var(--ease)" }}>
          <Menu.Item className="nk-menu-item" style={item} onSelect={() => go("projectSettings")}>Project settings</Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </MenuRoot>
  );
}
