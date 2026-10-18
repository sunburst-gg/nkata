// The shell: sidebar, header with breadcrumbs and the Viewer tag, the screen body, the toaster.
// Minimum width 1280. The zero states, arrival and sign in draw without it (routes.ts).
import type { ReactNode } from "react";
import { useStore } from "@/app/store";
import { DisconnectDialog } from "@/ui/connections/DisconnectDialog";
import { StatusLine } from "@/ui/connections/StatusLine";
import { InviteDialog } from "@/ui/invite/InviteDialog";
import { Toaster } from "@/ui/toast/Toaster";
import { Breadcrumbs, Sidebar } from "./Sidebar";
import { SwitchStudioDialog } from "./SwitchStudioDialog";

export function AppShell({ children }: { children: ReactNode }) {
  const viewer = useStore((s) => s.me?.role === "viewer");
  const slideIn = useStore((s) => s.slideIn);
  return (
    <div style={{ minHeight: "100vh", minWidth: 1280, display: "flex", background: "var(--canvas)", color: "var(--ink80)", position: "relative" }}>
      <div style={{ display: "contents" }} className={slideIn ? "nk-slide-in" : undefined}><Sidebar /></div>
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <StatusLine />
        <header style={{ height: 56, flexShrink: 0, display: "flex", alignItems: "center", gap: 16, padding: "0 40px" }}>
          <Breadcrumbs />
          <span style={{ flex: 1 }} />
          {viewer ? <span title="You can look and comment." style={{ fontSize: 12, padding: "2px 8px", borderRadius: "var(--r-6)", background: "var(--hover)", color: "var(--ink60)" }}>Viewer</span> : null}
        </header>
        <div style={{ flex: 1, minHeight: 0, padding: "8px 40px 40px" }}>{children}</div>
      </main>
      <InviteDialog />
      <SwitchStudioDialog />
      <DisconnectDialog />
      <Toaster />
    </div>
  );
}
