// Where a signed in person lands on live data: Arrival with the setup list until Blender has
// connected once on this computer and the project has a place on it; viewers never, they have
// nothing to install (step 11; widened to every role but viewer and to the place on 2026-10-23,
// docs/decisions.md).
import type { BlenderState } from "@/app/connection";
import { isViewer } from "@/auth/permissions";
import type { Role } from "@/data/types";

export type Landing = "arrival" | "project";

export function firstRunScreen(role: Role, blender: BlenderState, placed: boolean): Landing {
  if (isViewer(role)) return "project";
  const blenderNever = blender.kind === "disconnected" && !blender.version;
  return blenderNever || !placed ? "arrival" : "project";
}
