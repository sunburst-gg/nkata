import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/app.css";
import { App } from "./App";
import { useStore } from "./store";
import { connect, readSession, useMock, writeSession } from "./data/boot";

// Hook for the screenshot script and manual checks while the data is the in-memory mock:
// switch the mock role, open the rail, set review mode. Goes away with the real DataSource.
(window as unknown as { __nkata: unknown }).__nkata = {
  switchRole: (r: "artist" | "viewer") => useStore.getState().switchRole(r),
  setRail: (b: boolean) => useStore.getState().setRail(b),
  setReview: (b: boolean) => useStore.getState().setReview(b),
};

// A saved session reconnects before the first paint; the mock stays for the preview and tests.
const saved = useMock() ? null : readSession();
if (saved) {
  connect(saved, useStore.getState().theme)
    .then((source) => useStore.getState().useSource(source))
    .catch((err: unknown) => { writeSession(null); useStore.getState().toast(err instanceof Error ? err.message : "Sign in again.", "failed"); });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
