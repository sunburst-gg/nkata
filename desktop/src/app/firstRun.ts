// Where a signed in person lands on live data: Arrival with the setup list until Blender has
// connected once on this computer; viewers never, they have nothing to install (step 11; widened
// from artists to every other role on 2026-10-20, docs/decisions.md).
import type { BlenderState } from "@/app/connection";
import { isViewer } from "@/auth/permissions";
import type { Role } from "@/data/types";

export type Landing = "arrival" | "project";

export function firstRunScreen(role: Role, blender: BlenderState): Landing {
  return !isViewer(role) && blender.kind === "disconnected" && !blender.version ? "arrival" : "project";
}
