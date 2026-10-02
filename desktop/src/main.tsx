import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/app.css";
import { App } from "./App";
import { useStore } from "./store";

// Hook for the screenshot script and manual checks while the data is the in-memory mock:
// switch the mock role, open the rail, set review mode. Goes away with the real DataSource.
(window as unknown as { __nkata: unknown }).__nkata = {
  switchRole: (r: "artist" | "viewer") => useStore.getState().switchRole(r),
  setRail: (b: boolean) => useStore.getState().setRail(b),
  setReview: (b: boolean) => useStore.getState().setReview(b),
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
