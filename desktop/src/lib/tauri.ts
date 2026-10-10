// The window's side of the Tauri commands in src-tauri/src/desktop.rs. Outside Tauri (the
// browser preview, tests, screenshots) every call answers as if no agent ran.
// https://v2.tauri.app/develop/calling-rust/
import type { ToolsReport } from "@/lib/tools";

export interface AgentStatus {
  running: boolean;
  mode: "sync" | "stream" | null;
  project_id: string | null;
  folder: string | null;
  port: number | null;
}

const STOPPED: AgentStatus = { running: false, mode: null, project_id: null, folder: null, port: null };

export function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import("@tauri-apps/api/core");
  return mod.invoke<T>(command, args);
}

export const agent = {
  status: (): Promise<AgentStatus> => (inTauri() ? invoke<AgentStatus>("agent_status") : Promise.resolve(STOPPED)),
  startSync: (serverUrl: string, token: string, projectId: string, folder: string): Promise<AgentStatus> =>
    inTauri() ? invoke<AgentStatus>("agent_start_sync", { serverUrl, token, projectId, folder }) : Promise.resolve({ ...STOPPED, running: true, mode: "sync", project_id: projectId, folder }),
  startStream: (serverUrl: string, token: string, projectId: string): Promise<AgentStatus> =>
    inTauri() ? invoke<AgentStatus>("agent_start_stream", { serverUrl, token, projectId }) : Promise.resolve({ ...STOPPED, running: true, mode: "stream", project_id: projectId }),
  stop: (): Promise<AgentStatus> => (inTauri() ? invoke<AgentStatus>("agent_stop") : Promise.resolve(STOPPED)),
  writeExport: (folder: string, name: string, json: string): Promise<string> =>
    inTauri() ? invoke<string>("write_export", { folder, name, json }) : Promise.resolve(`${folder}/exports/${name}.json`),
  /** Blender on this machine and the Unreal projects inside the folder. */
  toolsDetect: (folder: string): Promise<ToolsReport> =>
    inTauri() ? invoke<ToolsReport>("tools_detect", { folder }) : Promise.resolve({ blender: null, uprojects: [], addon_shipped: false, plugin_shipped: false }),
  /** Installs and enables the add-on through Blender. Resolves to Blender's last line. */
  toolsInstallBlender: (): Promise<string> =>
    inTauri() ? invoke<string>("tools_install_blender") : Promise.reject(new Error("Only the desktop app installs tools.")),
  /** Copies the plugin into the Unreal project and turns it on. Resolves to the plugin folder. */
  toolsInstallUe: (uproject: string): Promise<string> =>
    inTauri() ? invoke<string>("tools_install_ue", { uproject }) : Promise.reject(new Error("Only the desktop app installs tools.")),
};
