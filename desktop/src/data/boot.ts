// Which data source the app runs on, and the session it keeps between launches.
// The mock runs the browser preview, the tests, and the screenshots. The server source runs the
// desktop app once someone has signed in. See DECISIONS.md.
import type { DataSource } from "./types";
import { createMockSource } from "./mock";
import { createServerSource, primaryRole } from "./server";

export const primaryRoleOf = primaryRole;
import { agent, inTauri } from "@/lib/tauri";

export interface SavedSession {
  serverUrl: string;
  token: string;
  projectId: string;
  /** The synced folder, or null for a viewer in stream mode. */
  folder: string | null;
  mode: "sync" | "stream";
}

const KEY = "nkata.session";
export const DEFAULT_SERVER_URL = "http://127.0.0.1:7400";

export function readSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<SavedSession>;
    if (!s.serverUrl || !s.token || !s.projectId || !s.mode) return null;
    return { serverUrl: s.serverUrl, token: s.token, projectId: s.projectId, folder: s.folder ?? null, mode: s.mode };
  } catch {
    return null;
  }
}

export function writeSession(s: SavedSession | null): void {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage can be blocked. The session lives for this launch only.
  }
}

/** The mock unless a session is saved, or the build asks for the server outright. */
export function useMock(): boolean {
  if (typeof window === "undefined") return true;
  if (import.meta.env["VITE_NKATA_MOCK"] === "1") return true;
  return readSession() === null && !inTauri();
}

function openSocket(url: string, onEvent: (event: Record<string, unknown>) => void): () => void {
  let socket: WebSocket | null = null;
  let closed = false;
  const connect = () => {
    if (closed) return;
    socket = new WebSocket(url);
    socket.onmessage = (m) => {
      try {
        onEvent(JSON.parse(String(m.data)) as Record<string, unknown>);
      } catch {
        // A frame that is not JSON is not an event.
      }
    };
    socket.onclose = () => { if (!closed) setTimeout(connect, 2000); };
  };
  connect();
  return () => { closed = true; socket?.close(); };
}

export type ServerSource = ReturnType<typeof createServerSource>;

/** Builds the server source for a saved session, loads it, and starts the agent in the window. */
export async function connect(session: SavedSession, theme: "dark" | "light"): Promise<ServerSource> {
  const source = createServerSource({ serverUrl: session.serverUrl, token: session.token, projectId: session.projectId, folder: session.folder, theme, socket: openSocket });
  await source.load();
  if (session.mode === "stream") await agent.startStream(session.serverUrl, session.token, session.projectId);
  else if (session.folder) await agent.startSync(session.serverUrl, session.token, session.projectId, session.folder);
  return source;
}

/** Magic link sign in. Dev servers answer with the link; production sends it by email. */
export async function requestLink(serverUrl: string, email: string): Promise<string | null> {
  const res = await fetch(`${serverUrl}/auth/magic-link`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
  if (!res.ok) throw new Error(`the server answered ${res.status}`);
  const body = (await res.json()) as { sent: boolean; link?: string };
  return body.link ?? null;
}

export function tokenFromLink(linkOrToken: string): string {
  try {
    return new URL(linkOrToken).searchParams.get("token") ?? linkOrToken.trim();
  } catch {
    return linkOrToken.trim();
  }
}

export async function redeem(serverUrl: string, token: string): Promise<{ token: string; roles: string[]; studio_id: string }> {
  const res = await fetch(`${serverUrl}/auth/callback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
  const body = (await res.json()) as { token: string; roles: string[]; studio_id: string; error?: { message: string } };
  if (!res.ok) throw new Error(body.error?.message ?? "that link is not valid");
  return body;
}

export async function listProjects(serverUrl: string, token: string): Promise<{ id: string; name: string; folder_name: string }[]> {
  const res = await fetch(`${serverUrl}/projects`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`the server answered ${res.status}`);
  return ((await res.json()) as { projects: { id: string; name: string; folder_name: string }[] }).projects;
}

export async function createProject(serverUrl: string, token: string, body: { name: string; folder_name: string; blender_version: string; ue_version: string }): Promise<{ id: string }> {
  const res = await fetch(`${serverUrl}/projects`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ ...body, package_version: "0.1.0" }) });
  const json = (await res.json()) as { project: { id: string }; error?: { message: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `the server answered ${res.status}`);
  return json.project;
}

export function mockSource(): DataSource {
  return createMockSource();
}
