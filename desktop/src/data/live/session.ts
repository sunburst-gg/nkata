// The session the desktop keeps between launches: where the server is, the token, the project
// and the folder this computer syncs. Stored under nkata.session; cleared on Log out.
export interface SavedSession {
  serverUrl: string;
  token: string;
  /** Empty before the studio has a project. */
  projectId: string;
  /** The synced folder, or null in stream mode (viewers). */
  folder: string | null;
}

const KEY = "nkata.session";
export const DEFAULT_SERVER_URL = "http://127.0.0.1:7400";

export function readSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<SavedSession>;
    // A session with no token still names the server: Log out keeps where the app points.
    if (!s.serverUrl) return null;
    return { serverUrl: s.serverUrl, token: s.token ?? "", projectId: s.projectId ?? "", folder: s.folder ?? null };
  } catch {
    return null;
  }
}

export function writeSession(s: SavedSession | null): void {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage can be blocked. The session lasts this launch.
  }
}

/** The server the app talks to: the build's, else the local dev server. */
export function serverUrl(): string {
  const fromEnv = import.meta.env["VITE_NKATA_SERVER_URL"] as string | undefined;
  return readSession()?.serverUrl ?? (fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_SERVER_URL);
}
