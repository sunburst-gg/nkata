// The single gate. Every role check in the app goes through can(action, role). A control a role
// cannot use is not rendered, never disabled (PROMPTS.md rule 4). Matrix from step 2, item 5.
import type { Role } from "@/data/types";

export type Action =
  | "invite" | "manageMembers" | "approve" | "requestChanges" | "publish" | "openInBlender" | "download"
  | "downloadImage" | "comment" | "createProject" | "renameProject" | "deleteProject" | "setTraining"
  | "billing" | "seeSetup" | "seeConnections" | "seeMine" | "setBudget";

export const ACTIONS: readonly Action[] = ["invite", "manageMembers", "approve", "requestChanges", "publish", "openInBlender", "download", "downloadImage", "comment", "createProject", "renameProject", "deleteProject", "setTraining", "billing", "seeSetup", "seeConnections", "seeMine", "setBudget"];

const ART_DIRECTOR: ReadonlySet<Action> = new Set<Action>(["approve", "requestChanges", "invite", "comment", "download", "downloadImage", "openInBlender", "seeConnections", "seeMine", "setBudget"]);
const ARTIST: ReadonlySet<Action> = new Set<Action>(["publish", "openInBlender", "download", "downloadImage", "comment", "seeSetup", "seeConnections", "seeMine"]);
const VIEWER: ReadonlySet<Action> = new Set<Action>(["comment", "downloadImage"]);

export function can(action: Action, role: Role): boolean {
  switch (role) {
    case "producer": return true;
    case "artDirector": return ART_DIRECTOR.has(action);
    case "artist": return ARTIST.has(action);
    case "viewer": return VIEWER.has(action);
  }
}

/** A lead is a producer or an art director. Leads land on the wall as the prototype's "lead". */
export const isLead = (role: Role): boolean => role === "producer" || role === "artDirector";

/** Which roles an inviter may hand out. An art director invites artists and viewers only. */
export function invitableRoles(role: Role): Role[] {
  if (role === "producer") return ["artist", "artDirector", "producer", "viewer"];
  if (role === "artDirector") return ["artist", "viewer"];
  return [];
}

export const ROLE_WORD: Record<Role, string> = { producer: "Producer", artDirector: "Art director", artist: "Artist", viewer: "Viewer" };
/** One sentence per role, from the prototype's Invite and the Members screen. */
export const ROLE_LINE: Record<Role, string> = {
  artist: "Artists save in Blender, publish, and answer comments.",
  artDirector: "Art directors look, comment, approve, and invite artists and viewers.",
  producer: "Producers do everything, and own members, billing and training.",
  viewer: "Viewers look and comment. They need no Blender.",
};
