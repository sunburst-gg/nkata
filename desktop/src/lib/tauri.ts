// The window's side of the Tauri commands in src-tauri/src/desktop.rs. Outside Tauri (the
// browser preview, tests, screenshots) every call answers as if no agent ran.
// https://v2.tauri.app/develop/calling-rust/
export interface AgentStatus {
  running: boolean;
  mode: "sync" | "stream" | null;
  project_id: string | null;
  folder: string | null;
  port: number | null;
  /** What stops the sync that the person must act on (a full disk), in the agent's words. */
  problem?: string;
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
  /** Connect Unreal: the plugin into the project, with Python and Remote Control on. Resolves to the plugin's folder. */
  toolsInstallUe: (uproject: string): Promise<string> =>
    inTauri() ? invoke<string>("tools_install_ue", { uproject }) : Promise.reject(new Error("Unreal connects from the desktop app.")),
  /** Disconnect: Blender disables and removes the add-on. Resolves to Blender's last line. */
  toolsRemoveBlender: (): Promise<string> =>
    inTauri() ? invoke<string>("tools_remove_blender") : Promise.resolve("removed"),
  /** What a place takes on this computer, the agent's own folder left out. */
  folderBytes: (folder: string): Promise<number> => (inTauri() ? invoke<number>("folder_bytes", { folder }) : Promise.resolve(0)),
  /** Whether Blender is running: an add-on installed now loads at its next start. */
  blenderRunning: (): Promise<boolean> => (inTauri() ? invoke<boolean>("blender_running") : Promise.resolve(false)),
};

/** Updates (src-tauri/src/updates.rs). A release build downloads a newer version in the
 * background; these say whether one is waiting and install it. Outside the desktop window there
 * is never one. */
export const updates = {
  /** The version waiting for Restart, or null. */
  ready: (): Promise<string | null> => (inTauri() ? invoke<string | null>("update_ready") : Promise.resolve(null)),
  /** Installs the waiting version and starts it. The window closes and opens again. */
  restart: (): Promise<void> => (inTauri() ? invoke<void>("update_restart") : Promise.resolve()),
};
