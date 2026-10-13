// Every role check in the app goes through can(). Components never read the role directly.
// A viewer sees everything, orbits, comments, and downloads images. What a viewer cannot do is
// not in the DOM. Roles follow shared/schemas/common.schema.json (docs/product.md, Roles).
// Producer: everything. Art director: review, approve, send back, gates, plus an artist's work.
// Artist: publish, mark Ready, open editors. Studio admin (members, training, billing, projects)
// is the producer's (handoff/v3/CLAUDE_CODE_PROMPT_v3.md, Roles).

export type Role = "artist" | "art_director" | "producer" | "viewer";

export type Action =
  | "publish"
  | "markReady"
  | "approve"
  | "sendBack"
  | "rollBack"
  | "removeGate"
  | "assign"
  | "confirmRights"
  | "exportProject"
  | "exportAsset"
  | "downloadImages"
  | "fixChecks"
  | "lock"
  | "openEditors"
  | "createProject"
  | "renameProject"
  | "deleteProject"
  | "createAsset"
  | "createStudio"
  | "invite"
  | "manageMembers"
  | "review"
  | "viewTemplates"
  | "editTemplates"
  | "viewSettings"
  | "setTraining"
  | "viewBilling"
  | "connectTools"
  | "comment"
  | "pin"
  | "ask"
  | "viewPeople";

const VIEWER: ReadonlySet<Action> = new Set<Action>(["comment", "pin", "downloadImages", "exportAsset", "viewPeople", "viewSettings", "ask"]);
const REVIEWERS: ReadonlySet<Role> = new Set<Role>(["art_director", "producer"]);
const PRODUCER_ONLY: ReadonlySet<Action> = new Set<Action>(["invite", "manageMembers", "setTraining", "viewBilling", "createStudio", "deleteProject", "renameProject"]);
// review is the Ready filter on the project screen, not the act of approving.
const REVIEWER_ONLY: ReadonlySet<Action> = new Set<Action>(["approve", "sendBack", "removeGate", "assign", "confirmRights", "editTemplates", "createAsset"]);

export function can(action: Action, role: Role): boolean {
  if (role === "viewer") return VIEWER.has(action);
  if (PRODUCER_ONLY.has(action)) return role === "producer";
  if (REVIEWER_ONLY.has(action)) return REVIEWERS.has(role);
  return true;
}

export const ROLE_WORDS: Record<Role, string> = {
  artist: "Artist",
  art_director: "Art director",
  producer: "Producer",
  viewer: "Viewer",
};

export const ROLES: Role[] = ["artist", "art_director", "producer", "viewer"];

/** Role lines for the members picker. Viewer is last, with one line. */
export const ROLE_LINES: { role: Role; line: string }[] = [
  { role: "artist", line: "Opens parts in Blender and Unreal. Publishes and marks Ready." },
  { role: "art_director", line: "Everything an artist does, plus review, approve, and gates." },
  { role: "producer", line: "Admin. Invites people, sets owners, rolls back anything." },
  { role: "viewer", line: "Sees everything, comments, changes nothing." },
];
