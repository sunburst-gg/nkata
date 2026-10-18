// Step 1: one screen. The lit stage from the prototype's asset page (cyclorama gradient tinted by
// the project color, the floor grid fading out radially) with one model turning on it, and a
// temporary theme toggle in the corner. Later steps replace this with the shell.
import { useEffect, useState } from "react";
import { NkViewer } from "@/viewer/NkViewer";
import { applyTheme, setTheme, themeNow, type Theme } from "@/app/theme";
import { Stage } from "@/ui/stage/Stage";

// Rising Sun is the first swatch.
const RISING_SUN = "var(--swatch-1)";

export function App() {
  const [theme, setThemeState] = useState<Theme>(() => themeNow());
  useEffect(() => { applyTheme("light"); setThemeState("light"); }, []);
  const toggle = () => setThemeState(setTheme(theme === "light" ? "dark" : "light"));
  return (
    <div style={{ minHeight: "100vh", minWidth: 1280, display: "flex", alignItems: "center", justifyContent: "center", padding: 48, background: "var(--canvas)" }}>
      <div style={{ width: "min(100%, 1100px)" }}>
        <Stage projectColor={RISING_SUN} radius={16} aspect="16/10" shadow>
          <NkViewer src="/fixtures/glb/Lantern.glb" autorotate={0.5} style={{ position: "absolute", inset: 0 }} />
        </Stage>
      </div>
      <button type="button" onClick={toggle} aria-label="Theme" style={{ position: "fixed", right: 24, top: 24, height: 32, padding: "0 12px", borderRadius: "var(--r-6)", border: "1px solid var(--line)", background: "var(--raised)", color: "var(--ink80)", font: "500 var(--t-13) var(--sans)", boxShadow: "var(--shadow)" }}>
        {theme === "light" ? "Dark" : "Light"}
      </button>
    </div>
  );
}
