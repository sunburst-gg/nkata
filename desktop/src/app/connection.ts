// The Blender connection, a machine with the ten states of step 9, moved only by DataSource
// events: toolDetected, addonInstalled, addonOutdated, heartbeat, heartbeatLost, paused,
// resumed, disconnected. Nothing here keeps time; the source says when a heartbeat is lost.
import type { BlenderInstall } from "@/data/types";

export type BlenderState =
  | { kind: "notFound" }
  | { kind: "several"; found: BlenderInstall[] }
  | { kind: "unsupported"; version: string }
  /** Found, add-on not installed. */
  | { kind: "found"; version: string }
  | { kind: "outdated"; version: string; addon: string; blenderOpen: boolean }
  /** Connected, Blender closed. restart: the add-on updated while Blender was open. */
  | { kind: "connected"; version: string; addon: string; restart?: boolean }
  | { kind: "open"; version: string; addon: string; file: string }
  | { kind: "lost"; version: string; addon: string; file: string }
  | { kind: "paused"; version: string; addon: string }
  | { kind: "disconnected"; version: string | null };

export type BlenderKind = BlenderState["kind"];
export const BLENDER_KINDS: readonly BlenderKind[] = ["notFound", "several", "unsupported", "found", "outdated", "connected", "open", "lost", "paused", "disconnected"];

export type ConnectionEvent =
  | { type: "toolDetected"; installs: BlenderInstall[] }
  | { type: "addonInstalled"; addon: string; restart?: boolean }
  | { type: "addonOutdated"; addon: string; blenderOpen: boolean }
  | { type: "heartbeat"; file: string }
  | { type: "heartbeatLost" }
  | { type: "paused" }
  | { type: "resumed" }
  | { type: "disconnected" };

export const MIN_BLENDER = "4.2";

export const INITIAL: BlenderState = { kind: "disconnected", version: null };

/** "4.2.3" against "4.2": true when the install is new enough. */
export function supported(version: string, min: string = MIN_BLENDER): boolean {
  const a = version.split(".").map((n) => parseInt(n, 10) || 0);
  const b = min.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}

function versionOf(s: BlenderState): string | null {
  return "version" in s ? s.version : null;
}

export function apply(s: BlenderState, e: ConnectionEvent): BlenderState {
  switch (e.type) {
    case "toolDetected": {
      if (e.installs.length === 0) return { kind: "notFound" };
      if (e.installs.length > 1) return { kind: "several", found: e.installs };
      const one = e.installs[0]!;
      if (!supported(one.version)) return { kind: "unsupported", version: one.version };
      // The same Blender seen again keeps a live connection.
      if ((s.kind === "connected" || s.kind === "open" || s.kind === "paused" || s.kind === "lost") && s.version === one.version) return s;
      return { kind: "found", version: one.version };
    }
    case "addonInstalled": {
      const version = versionOf(s) ?? "";
      return e.restart ? { kind: "connected", version, addon: e.addon, restart: true } : { kind: "connected", version, addon: e.addon };
    }
    case "addonOutdated":
      return { kind: "outdated", version: versionOf(s) ?? "", addon: e.addon, blenderOpen: e.blenderOpen };
    case "heartbeat":
      if (s.kind === "connected" || s.kind === "open" || s.kind === "lost") return { kind: "open", version: s.version, addon: s.addon, file: e.file };
      if (s.kind === "outdated") return { ...s, blenderOpen: true };
      return s;
    case "heartbeatLost":
      if (s.kind === "open") return { kind: "lost", version: s.version, addon: s.addon, file: s.file };
      if (s.kind === "outdated") return { ...s, blenderOpen: false };
      return s;
    case "paused":
      if (s.kind === "connected" || s.kind === "open" || s.kind === "lost") return { kind: "paused", version: s.version, addon: s.addon };
      return s;
    case "resumed":
      if (s.kind === "paused") return { kind: "connected", version: s.version, addon: s.addon };
      return s;
    case "disconnected":
      return { kind: "disconnected", version: versionOf(s) };
  }
}

/** The one line the card says, and the sidebar dot's hover. */
export function line(s: BlenderState): string {
  switch (s.kind) {
    case "notFound": return "Blender is not on this computer.";
    case "several": return `Nkata found ${s.found.length} Blenders.`;
    case "unsupported": return `Blender ${s.version} is too old. Nkata works with ${MIN_BLENDER} and newer.`;
    case "found": return `Blender ${s.version} found.`;
    case "outdated": return "The Nkata add-on needs an update.";
    case "connected": return s.restart ? "Restart Blender to finish." : `Blender ${s.version}. Add-on ${s.addon}.`;
    case "open": return "In Blender now:";
    case "lost": return "Blender stopped talking to Nkata.";
    case "paused": return "Paused. Saves stay on this computer until you resume.";
    case "disconnected": return "Blender is not connected.";
  }
}

export type Dot = "ok" | "paused" | "action" | "live";

/** The sidebar dot: green when everything works, hollow neutral when paused, red when an action is needed. */
export function dot(s: BlenderState): Dot {
  if (s.kind === "open") return "live";
  if (s.kind === "connected") return "ok";
  if (s.kind === "paused") return "paused";
  return "action";
}

/** The primary action for a state, or null. At most one per state. */
export function primary(s: BlenderState): { label: string; action: "connect" | "update" | "reconnect" | "resume" | "pickBlender" } | null {
  switch (s.kind) {
    case "notFound": return { label: "Find Blender", action: "pickBlender" };
    case "found": return { label: "Connect Blender", action: "connect" };
    case "outdated": return { label: "Update", action: "update" };
    case "lost": return { label: "Reconnect", action: "reconnect" };
    case "paused": return { label: "Resume", action: "resume" };
    case "disconnected": return { label: "Connect Blender", action: "connect" };
    default: return null;
  }
}
