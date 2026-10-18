// Which DataSource the app runs on. The mock: in tests, with ?mock=1, or with any Tweak in the
// URL (the prototype's role, stage, startScreen, blender). Live otherwise: the server the
// session names, or the local dev server. See docs/decisions.md, v8 step 11.
import { LiveDataSource } from "./live/LiveDataSource";
import { readSession, serverUrl } from "./live/session";

export type SourceChoice = { kind: "mock" } | { kind: "live"; source: LiveDataSource };

const TWEAK_KEYS = ["mock", "role", "stage", "startScreen", "blender"];

export function wantsMock(search: string): boolean {
  if (import.meta.env.MODE === "test") return true;
  const q = new URLSearchParams(search);
  return TWEAK_KEYS.some((k) => q.has(k));
}

export function pickSource(search: string): SourceChoice {
  if (wantsMock(search)) return { kind: "mock" };
  const session = readSession();
  return { kind: "live", source: new LiveDataSource({ serverUrl: serverUrl(), token: session?.token ?? "", folder: session?.folder ?? null }) };
}
