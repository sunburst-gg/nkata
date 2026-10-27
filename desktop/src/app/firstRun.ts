// Where a signed in person lands on live data: Arrival with the setup list until Blender has
// connected once on this computer and the project has a place on it; viewers never, they have
// nothing to install (step 11; widened to every role but viewer and to the place on 2026-10-23,
// docs/decisions.md).
import { isViewer } from "@/auth/permissions";
import type { Role } from "@/data/types";

export type Landing = "arrival" | "project";

/**
 * `connectedBefore` is what this computer remembers, not Blender's state: at launch that is still
 * being detected and read as never connected, so every launch landed on Arrival (2026-10-27).
 */
export function firstRunScreen(role: Role, connectedBefore: boolean, placed: boolean): Landing {
  if (isViewer(role)) return "project";
  return connectedBefore && placed ? "project" : "arrival";
}
