// Every role check in the app goes through can(). Components never read the role directly.
// A viewer sees everything and comments. What a viewer cannot do is not in the DOM.
// Roles follow shared/schemas/common.schema.json (docs/product.md, Roles and permissions).

export type Role = "artist" | "art_director" | "producer" | "viewer";

export type Action =
  | "publish"
  | "markReady"
  | "approve"
  | "sendBack"
  | "rollBack"
  | "removeGate"
  | "assign"
  | "exportProject"
  | "exportAsset"
  | "downloadImages"
  | "fixChecks"
  | "lock"
  | "openEditors"
  | "createProject"
  | "createStudio"
  | "invite"
  | "review"
  | "viewTemplates"
  | "editTemplates"
  | "viewSettings"
  | "comment"
  | "viewPeople"
  | "setDigestHome";

const VIEWER: ReadonlySet<Action> = new Set<Action>(["comment", "downloadImages", "exportAsset", "viewPeople", "setDigestHome"]);
const REVIEWERS: ReadonlySet<Role> = new Set<Role>(["art_director", "producer"]);
const ADMIN_ONLY: ReadonlySet<Action> = new Set<Action>(["invite", "viewSettings"]);
// review is the Ready filter on the project screen, not the act of approving.
const REVIEWER_ONLY: ReadonlySet<Action> = new Set<Action>(["approve", "sendBack", "removeGate", "assign", "editTemplates"]);

export function can(action: Action, role: Role): boolean {
  if (role === "viewer") return VIEWER.has(action);
  if (action === "setDigestHome") return false;
  if (ADMIN_ONLY.has(action)) return role === "producer";
  if (REVIEWER_ONLY.has(action)) return REVIEWERS.has(role);
  if (action === "rollBack") return true;
  return true;
}

export const ROLE_WORDS: Record<Role, string> = {
  artist: "Artist",
  art_director: "Art director",
  producer: "Producer",
  viewer: "Viewer",
};

/** Invite sheet order and lines. Viewer is last, with one line. */
export const ROLE_LINES: { role: Role; line: string }[] = [
  { role: "artist", line: "Opens parts in Blender and Unreal. Publishes and marks Ready." },
  { role: "art_director", line: "Everything an artist does, plus review, approve, and gates." },
  { role: "producer", line: "Admin. Invites people, sets owners, rolls back anything." },
  { role: "viewer", line: "Sees everything, comments, changes nothing." },
];
