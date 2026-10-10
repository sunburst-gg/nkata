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
  /** Empty before the studio has a project. */
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
    if (!s.serverUrl || !s.token || !s.mode) return null;
    return { serverUrl: s.serverUrl, token: s.token, projectId: s.projectId ?? "", folder: s.folder ?? null, mode: s.mode };
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

let errorSink: (message: string) => void = () => undefined;
/** Where a refused write is reported. main.tsx points it at the toast. */
export function setErrorSink(fn: (message: string) => void): void {
  errorSink = fn;
}

/** Builds the server source for a saved session, loads it, and starts the agent in the window. */
export async function connect(session: SavedSession, theme: "dark" | "light"): Promise<ServerSource> {
  const source = createServerSource({ serverUrl: session.serverUrl, token: session.token, projectId: session.projectId, folder: session.folder, theme, socket: openSocket, onError: (m) => errorSink(m) });
  await source.load();
  if (!session.projectId) return source;
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

/** What the server says about the account after a sign in, a studio switch, or Create studio. */
export interface Account {
  token: string;
  user: { id: string; name: string; avatar_url: string | null };
  email: string;
  studio_id: string | null;
  roles: string[];
  studios: { id: string; name: string; roles: string[] }[];
}

async function accountCall(serverUrl: string, path: string, body: unknown, token?: string): Promise<Account> {
  const res = await fetch(`${serverUrl}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const json = (await res.json()) as Account & { error?: { message: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `the server answered ${res.status}`);
  return json;
}

export function redeem(serverUrl: string, token: string): Promise<Account> {
  return accountCall(serverUrl, "/auth/callback", { token });
}

/** Where the app opens for a loaded source: Name, Create studio, the first project, or Welcome. */
export function routeFor(source: ServerSource): string {
  const db = source.snapshot();
  if (!db.session.user.name) return "/name";
  if (db.session.studios.length === 0 || !db.session.studio.id) return "/studio";
  const first = db.session.studio.projects[0];
  return first ? `/p/${first.slug}` : "/welcome";
}

/** Enters the account's studio (or none yet) and its first project. Saves the session. */
export async function enterAccount(serverUrl: string, account: Account, theme: "dark" | "light"): Promise<ServerSource> {
  if (!account.studio_id) {
    const session: SavedSession = { serverUrl, token: account.token, projectId: "", folder: null, mode: "stream" };
    const source = await connect(session, theme);
    writeSession(session);
    return source;
  }
  const projects = await listProjects(serverUrl, account.token);
  return enterServer(serverUrl, account.token, account.roles, projects[0] ?? null, theme);
}

/** Create your studio in the desktop app: the account becomes its producer and the session moves into it. */
export async function createServerStudio(name: string, training: "on" | "off", theme: "dark" | "light"): Promise<ServerSource> {
  const saved = readSession();
  if (!saved) throw new Error("Sign in first.");
  const account = await accountCall(saved.serverUrl, "/studios", { name, training }, saved.token);
  return enterAccount(saved.serverUrl, account, theme);
}

/** Switch studio: a session for another studio of the account, then its first project. */
export async function switchServerStudio(studioId: string, theme: "dark" | "light"): Promise<ServerSource> {
  const saved = readSession();
  if (!saved) throw new Error("Sign in first.");
  const account = await accountCall(saved.serverUrl, "/auth/switch", { studio_id: studioId }, saved.token);
  return enterAccount(saved.serverUrl, account, theme);
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

const FOLDERS_KEY = "nkata.folders";

/** The synced folder this machine uses for a project. Chosen at New project; the default otherwise. */
export function folderFor(projectId: string, name: string): string {
  try {
    const map = JSON.parse(localStorage.getItem(FOLDERS_KEY) ?? "{}") as Record<string, string>;
    return map[projectId] ?? `~/Documents/Nkata/${name}`;
  } catch {
    return `~/Documents/Nkata/${name}`;
  }
}

export function rememberFolder(projectId: string, folder: string): void {
  try {
    const map = JSON.parse(localStorage.getItem(FOLDERS_KEY) ?? "{}") as Record<string, string>;
    map[projectId] = folder;
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(map));
  } catch {
    // Storage can be blocked. The default folder applies next launch.
  }
}

/** Connects a signed-in person to one project, or to the studio alone when there is none yet. */
export async function enterServer(serverUrl: string, token: string, roles: string[], project: { id: string; name: string } | null, theme: "dark" | "light"): Promise<ServerSource> {
  const viewer = primaryRole(roles) === "viewer";
  const session: SavedSession = project
    ? { serverUrl, token, projectId: project.id, folder: viewer ? null : folderFor(project.id, project.name), mode: viewer ? "stream" : "sync" }
    : { serverUrl, token, projectId: "", folder: null, mode: "stream" };
  const source = await connect(session, theme);
  writeSession(session);
  return source;
}

/** New project in server mode: create it, then reconnect to it with the chosen folder. */
export async function createServerProject(input: { name: string; folder: string; blender: string; unreal: string }, theme: "dark" | "light"): Promise<ServerSource> {
  const saved = readSession();
  if (!saved) throw new Error("Sign in first.");
  const made = await createProject(saved.serverUrl, saved.token, { name: input.name, folder_name: input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), blender_version: input.blender, ue_version: input.unreal });
  rememberFolder(made.id, input.folder);
  const session: SavedSession = { ...saved, projectId: made.id, folder: input.folder, mode: "sync" };
  const source = await connect(session, theme);
  writeSession(session);
  return source;
}

/** Opens another project of the studio: the agent moves to its folder and the screens reload. */
export async function openServerProject(project: { id: string; name: string }, viewer: boolean, theme: "dark" | "light"): Promise<ServerSource | null> {
  const saved = readSession();
  if (!saved || saved.projectId === project.id) return null;
  const session: SavedSession = { ...saved, projectId: project.id, folder: viewer ? null : folderFor(project.id, project.name), mode: viewer ? "stream" : "sync" };
  const source = await connect(session, theme);
  writeSession(session);
  return source;
}
