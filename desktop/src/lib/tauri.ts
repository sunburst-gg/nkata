// The window's side of the Tauri commands in src-tauri/src/desktop.rs. Outside Tauri (the
// browser preview, tests, screenshots) every call answers as if no agent ran.
// https://v2.tauri.app/develop/calling-rust/
export interface AgentStatus {
  running: boolean;
  mode: "sync" | "stream" | null;
  project_id: string | null;
  folder: string | null;
  port: number | null;
}

/** What the agent found on this computer: Blender, and the Unreal projects inside the folder. */
export interface ToolsReport {
  blender: { exe: string; version: string } | null;
  uprojects: string[];
  addon_shipped: boolean;
  plugin_shipped: boolean;
}

const STOPPED: AgentStatus = { running: false, mode: null, project_id: null, folder: null, port: null };

/** Outside the desktop window there is no background process; this stands in for it and
 * remembers what it was last asked to do, so status reads true in a browser walk. */
let browserAgent: AgentStatus = STOPPED;
const remembered = (next: AgentStatus): AgentStatus => { browserAgent = next; return next; };

export function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import("@tauri-apps/api/core");
  return mod.invoke<T>(command, args);
}

export const agent = {
  status: (): Promise<AgentStatus> => (inTauri() ? invoke<AgentStatus>("agent_status") : Promise.resolve(browserAgent)),
  startSync: (serverUrl: string, token: string, projectId: string, folder: string): Promise<AgentStatus> =>
    inTauri() ? invoke<AgentStatus>("agent_start_sync", { serverUrl, token, projectId, folder }) : Promise.resolve(remembered({ ...STOPPED, running: true, mode: "sync", project_id: projectId, folder })),
  startStream: (serverUrl: string, token: string, projectId: string): Promise<AgentStatus> =>
    inTauri() ? invoke<AgentStatus>("agent_start_stream", { serverUrl, token, projectId }) : Promise.resolve(remembered({ ...STOPPED, running: true, mode: "stream", project_id: projectId })),
  stop: (): Promise<AgentStatus> => (inTauri() ? invoke<AgentStatus>("agent_stop") : Promise.resolve(remembered(STOPPED))),
  toolsDetect: (folder: string): Promise<ToolsReport> =>
    inTauri() ? invoke<ToolsReport>("tools_detect", { folder }) : Promise.resolve({ blender: null, uprojects: [], addon_shipped: false, plugin_shipped: false }),
  /** Installs and enables the add-on through Blender's own command line. Resolves to Blender's last line. */
  toolsInstallBlender: (): Promise<string> =>
    inTauri() ? invoke<string>("tools_install_blender") : Promise.reject(new Error("Only the desktop app installs the add-on.")),
  /** Open in Blender: the asset's own file in the project folder. */
  openInBlender: (relFile: string): Promise<string> =>
    inTauri() ? invoke<string>("open_in_blender", { relFile }) : Promise.reject(new Error("Files open in Blender from the desktop app.")),
  /** A previous Version: fetches the .blend behind it and opens it as its own file. */
  openVersion: (partId: string, versionId: string, fileName: string): Promise<string> =>
    inTauri() ? invoke<string>("open_version", { partId, versionId, fileName }) : Promise.reject(new Error("Versions open in Blender from the desktop app.")),
  /** Fetches a file the server serves and writes it where the person chose. Resolves to the path. */
  downloadFile: (url: string, path: string): Promise<string> =>
    inTauri() ? invoke<string>("download_file", { url, path }) : Promise.reject(new Error("Downloads save from the desktop app.")),
  listBlendFiles: (folder: string): Promise<string[]> =>
    inTauri() ? invoke<string[]>("list_blend_files", { folder }) : Promise.resolve([]),
  /** Where the project lives if the person picks `folder`: the folder, or one named after the project inside it. */
  placeFor: (folder: string, name: string, projectId: string): Promise<string> =>
    inTauri() ? invoke<string>("place_for", { folder, name, projectId }) : Promise.resolve(folder),
  /** Whether Blender is running: an add-on installed now loads at its next start. */
  blenderRunning: (): Promise<boolean> => (inTauri() ? invoke<boolean>("blender_running") : Promise.resolve(false)),
};
