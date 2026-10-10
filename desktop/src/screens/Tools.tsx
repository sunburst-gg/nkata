// The Tools step and the Settings rows: Blender and Unreal on this machine, the add-on and the
// plugin installed by the app. Words come from lib/tools.ts; the work runs in src-tauri/src/tools.rs.
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Spinner } from "@/components/Button";
import { agent } from "@/lib/tauri";
import { describeTools, type InstallState, type ToolAction, type ToolsReport } from "@/lib/tools";

const NOTHING: ToolsReport = { blender: null, uprojects: [], addon_shipped: false, plugin_shipped: false };

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** With `auto`, the add-on installs as soon as Blender is found: the setup flow. Settings waits for a click. */
export function ToolsSetup({ folder, auto = false }: { folder: string; auto?: boolean }) {
  const [report, setReport] = useState<ToolsReport | null>(null);
  const [addon, setAddon] = useState<InstallState>({ kind: "idle" });
  const [plugins, setPlugins] = useState<Record<string, InstallState>>({});
  const autoRan = useRef(false);

  const detect = useCallback(async () => {
    setReport(null);
    try {
      setReport(await agent.toolsDetect(folder));
    } catch {
      setReport(NOTHING);
    }
  }, [folder]);

  const installBlender = useCallback(async () => {
    setAddon({ kind: "busy" });
    try {
      setAddon({ kind: "done", line: await agent.toolsInstallBlender() });
    } catch (err) {
      setAddon({ kind: "failed", line: message(err) });
    }
  }, []);

  const installUe = useCallback(async (uproject: string) => {
    setPlugins((p) => ({ ...p, [uproject]: { kind: "busy" } }));
    try {
      const line = await agent.toolsInstallUe(uproject);
      setPlugins((p) => ({ ...p, [uproject]: { kind: "done", line } }));
    } catch (err) {
      setPlugins((p) => ({ ...p, [uproject]: { kind: "failed", line: message(err) } }));
    }
  }, []);

  useEffect(() => { void detect(); }, [detect]);
  useEffect(() => {
    if (auto && report?.blender && report.addon_shipped && !autoRan.current) {
      autoRan.current = true;
      void installBlender();
    }
  }, [auto, report, installBlender]);

  const run = (action: ToolAction) => {
    if (action.kind === "detect") void detect();
    else if (action.kind === "install_blender") void installBlender();
    else void installUe(action.uproject);
  };

  return (
    <div className="flex flex-col" aria-label="Tools">
      {describeTools(report, addon, plugins).map((row) => (
        <div key={row.id} className="flex min-h-13 items-center gap-4 border-b border-border py-2">
          <span className="w-28 shrink-0">{row.tool}</span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="font-mono text-15 font-medium text-body">{row.value}</span>
            {row.note ? <span className="text-13 text-secondary">{row.note}</span> : null}
          </div>
          {row.busy ? <Spinner /> : null}
          {row.button ? <Button size="sm" className="h-8" onClick={() => run(row.button!.action)}>{row.button.label}</Button> : null}
        </div>
      ))}
    </div>
  );
}
