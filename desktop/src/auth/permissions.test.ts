import { describe, expect, it } from "vitest";
import type { Role } from "@/data/types";
import { ACTIONS, can, invitableRoles, type Action } from "./permissions";

const ROLES: Role[] = ["producer", "artDirector", "artist", "viewer"];
// The matrix from PROMPTS.md step 2, item 5, written out so a change here is a decision.
const MATRIX: Record<Role, Action[]> = {
  producer: [...ACTIONS],
  artDirector: ["approve", "requestChanges", "invite", "comment", "download", "downloadImage", "openInBlender", "seeSetup", "seeConnections", "seeMine", "setBudget", "seeJourney", "seeDisk"],
  artist: ["publish", "openInBlender", "download", "downloadImage", "comment", "seeSetup", "seeConnections", "seeMine", "seeJourney", "seeDisk"],
  viewer: ["comment", "downloadImage"],
};

describe("can()", () => {
  it("covers every action for every role, as the matrix says", () => {
    for (const role of ROLES) for (const action of ACTIONS) expect(can(action, role), `${role} ${action}`).toBe(MATRIX[role].includes(action));
  });
  it("never lets a viewer near Blender, folders, setup or the journey", () => {
    for (const a of ["openInBlender", "seeSetup", "seeConnections", "seeMine", "publish", "approve", "invite", "seeJourney", "seeDisk"] as Action[]) expect(can(a, "viewer")).toBe(false);
  });
  it("lets an art director invite artists and viewers only", () => {
    expect(invitableRoles("artDirector")).toEqual(["artist", "viewer"]);
    expect(invitableRoles("producer")).toHaveLength(4);
    expect(invitableRoles("artist")).toEqual([]);
  });
});
