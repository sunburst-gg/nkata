import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/app.css";
import { App } from "./App";
import { useStore } from "./store";
import { connect, readSession, useMock, writeSession } from "./data/boot";

// Hook for the screenshot script and manual checks while the data is the in-memory mock: the
// prototype's Tweaks. demoStage, role, theme, and the rail. Goes away with the real DataSource.
(window as unknown as { __nkata: unknown }).__nkata = {
  setStage: (stage: "fresh" | "connected" | "firstAsset" | "populated") => useStore.getState().setStage(stage),
  switchRole: (r: "artist" | "viewer") => useStore.getState().switchRole(r),
  setRail: (b: boolean) => useStore.getState().setRail(b),
  setTab: (t: "All" | "Characters" | "Props" | "Levels" | "Ready") => useStore.getState().setTab(t),
  setTheme: (t: "dark" | "light") => useStore.getState().setTheme(t),
  open: (what: "members" | "ask" | "createAsset") => { const s = useStore.getState(); if (what === "members") s.setMembers(true); else if (what === "ask") s.setAsk(true); else s.setCreateAsset(true); },
  createProject: (name: string) => void useStore.getState().source.createProject({ name, folder: `~/Documents/Nkata/${name}`, blender: "5.1.2", unreal: "5.8.1" }),
  fullScreen: (assetSlug: string, partName?: string) => useStore.getState().setFullScreen(partName ? { assetSlug, partName } : { assetSlug }),
};

// A saved session reconnects before the first paint; the mock stays for the preview and tests.
const saved = useMock() ? null : readSession();
if (saved) {
  connect(saved, useStore.getState().theme)
    .then((source) => { useStore.getState().useSource(source); if (!location.hash || location.hash === "#/" || location.hash === "#/signin") location.hash = saved.projectId ? `#/p/${source.snapshot().session.studio.projects[0]?.slug ?? ""}` : "#/welcome"; })
    .catch((err: unknown) => { writeSession(null); useStore.getState().toast(err instanceof Error ? err.message : "Sign in again.", "failed"); });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
