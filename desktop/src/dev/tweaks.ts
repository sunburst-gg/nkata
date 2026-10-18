// The prototype's Tweaks, read from the URL in dev: ?role=lead&stage=empty&startScreen=project&theme=dark
import { STAGES, TWEAK_ROLES, type Stage, type TweakRole } from "@/data/mock";
import { BLENDER_KINDS, type BlenderKind } from "@/app/connection";

export type StartScreen = "project" | "asset" | "mentions" | "connections" | "sample";
export const START_SCREENS: StartScreen[] = ["project", "asset", "mentions", "connections", "sample"];

/** blender: "" keeps the stage's own connection; a kind jumps the mock there after boot (step 9). */
export interface Tweaks { role: TweakRole; stage: Stage; startScreen: StartScreen; theme: "light" | "dark"; blender: BlenderKind | "" }

export const DEFAULT_TWEAKS: Tweaks = { role: "artist", stage: "studio", startScreen: "project", theme: "light", blender: "" };
export const BLENDER_TWEAKS: readonly (BlenderKind | "")[] = ["", ...BLENDER_KINDS];

const pick = <T extends string>(v: string | null, list: readonly T[], fallback: T): T => (v && (list as readonly string[]).includes(v) ? (v as T) : fallback);

export function tweaksFromUrl(search: string): Tweaks {
  const q = new URLSearchParams(search);
  const roleRaw = q.get("role");
  return {
    role: pick(roleRaw === "lead" ? "lead" : roleRaw, TWEAK_ROLES, DEFAULT_TWEAKS.role),
    stage: pick(q.get("stage"), STAGES, DEFAULT_TWEAKS.stage),
    startScreen: pick(q.get("startScreen"), START_SCREENS, DEFAULT_TWEAKS.startScreen),
    theme: pick(q.get("theme"), ["light", "dark"] as const, DEFAULT_TWEAKS.theme),
    blender: pick(q.get("blender"), BLENDER_TWEAKS, DEFAULT_TWEAKS.blender),
  };
}

export function tweaksToSearch(t: Tweaks): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(t)) if (v !== DEFAULT_TWEAKS[k as keyof Tweaks]) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : "";
}
