// The app. The shell wraps every in-app screen; bare screens (zero states, arrival, sign in)
// draw alone.
import { useEffect, useState } from "react";
import { useStore } from "@/app/store";
import { bootMock } from "@/app/boot";
import { BARE, TITLE } from "@/app/routes";
import { DevTweaks } from "@/dev/DevTweaks";
import { tweaksFromUrl, type Tweaks } from "@/dev/tweaks";
import type { MockDataSource } from "@/data/mock";
import { NkViewer } from "@/viewer/NkViewer";
import { AppShell } from "@/ui/shell/AppShell";
import { Stage } from "@/ui/stage/Stage";
import { Toaster } from "@/ui/toast/Toaster";
import { Wall } from "@/screens/Wall";
import { AssetScreen } from "@/screens/Asset";
import { Zero } from "@/screens/Zero";
import { Arrival } from "@/screens/Arrival";
import { NameScreen, SignIn } from "@/screens/SignIn";
import { SettingsScreen } from "@/screens/Settings";
import { ProjectSettingsScreen } from "@/screens/ProjectSettings";
import { MentionsScreen } from "@/screens/Mentions";
import { NewProjectScreen } from "@/screens/NewProject";
import { ConnectionsScreen } from "@/screens/Connections";

function Placeholder() {
  const screen = useStore((s) => s.screen);
  const project = useStore((s) => s.projects.find((p) => p.id === s.projectId) ?? null);
  const asset = useStore((s) => s.assets.find((a) => a.id === s.assetId) ?? null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 8 }}>
      <h1 style={{ margin: 0, font: "400 var(--t-28)/1.1 var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)" }}>{asset?.name ?? TITLE[screen] ?? project?.name ?? ""}</h1>
      {screen === "asset" || screen === "project" ? (
        <Stage projectColor={project?.color} radius={16} aspect="16/10" shadow style={{ maxWidth: 960 }}>
          <NkViewer src={asset?.glb ?? "/fixtures/glb/Lantern.glb"} autorotate={0.5} style={{ position: "absolute", inset: 0 }} />
        </Stage>
      ) : null}
    </div>
  );
}

export function App() {
  const [tweaks, setTweaks] = useState<Tweaks>(() => tweaksFromUrl(location.search));
  const [mock, setMock] = useState<MockDataSource | null>(null);
  useEffect(() => { void bootMock(tweaks).then(setMock); }, [tweaks]);
  const screen = useStore((s) => s.screen);
  const body = BARE.has(screen) ? (
    <>
      {screen === "zeroStudio" ? <Zero which="studio" /> : screen === "zeroProject" ? <Zero which="project" /> : screen === "arrival" ? <Arrival /> : screen === "signIn" ? <SignIn /> : screen === "name" ? <NameScreen /> : <div style={{ minHeight: "100vh", minWidth: 1280, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--canvas)" }}><Placeholder /></div>}
      <Toaster />
    </>
  ) : (
    <AppShell>{screen === "project" ? <Wall /> : screen === "asset" ? <AssetScreen /> : screen === "settings" ? <SettingsScreen /> : screen === "projectSettings" ? <ProjectSettingsScreen /> : screen === "mentions" ? <MentionsScreen /> : screen === "newProject" ? <NewProjectScreen /> : screen === "connections" ? <ConnectionsScreen /> : <Placeholder />}</AppShell>
  );
  return (
    <>
      {body}
      {import.meta.env.DEV && mock ? <DevTweaks mock={mock} tweaks={tweaks} onChange={setTweaks} /> : null}
    </>
  );
}
