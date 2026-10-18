// The app. Step 2: the store is booted from the Tweaks and every screen is reachable; bodies
// are placeholders until their step. The step 1 stage stays as the asset placeholder.
import { useEffect, useState } from "react";
import { useStore } from "@/app/store";
import { bootMock } from "@/app/boot";
import { DevTweaks } from "@/dev/DevTweaks";
import { tweaksFromUrl, type Tweaks } from "@/dev/tweaks";
import type { MockDataSource } from "@/data/mock";
import { NkViewer } from "@/viewer/NkViewer";
import { Stage } from "@/ui/stage/Stage";

export function App() {
  const [tweaks, setTweaks] = useState<Tweaks>(() => tweaksFromUrl(location.search));
  const [mock, setMock] = useState<MockDataSource | null>(null);
  useEffect(() => { void bootMock(tweaks).then(setMock); }, [tweaks]);
  const screen = useStore((s) => s.screen);
  const project = useStore((s) => s.projects.find((p) => p.id === s.projectId) ?? null);
  const asset = useStore((s) => s.assets.find((a) => a.id === s.assetId) ?? null);
  return (
    <div style={{ minHeight: "100vh", minWidth: 1280, display: "flex", alignItems: "center", justifyContent: "center", padding: 48, background: "var(--canvas)" }}>
      <div style={{ width: "min(100%, 1100px)", display: "flex", flexDirection: "column", gap: 16 }}>
        <span style={{ font: "400 var(--t-13) var(--mono)", color: "var(--ink40)" }}>{screen}{project ? ` · ${project.name}` : ""}{asset ? ` · ${asset.name}` : ""}</span>
        <Stage projectColor={project?.color} radius={16} aspect="16/10" shadow>
          <NkViewer src={asset?.glb ?? "/fixtures/glb/Lantern.glb"} autorotate={0.5} style={{ position: "absolute", inset: 0 }} />
        </Stage>
      </div>
      {import.meta.env.DEV && mock ? <DevTweaks mock={mock} tweaks={tweaks} onChange={setTweaks} /> : null}
    </div>
  );
}
