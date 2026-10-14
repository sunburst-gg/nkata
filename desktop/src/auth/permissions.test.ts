import { describe, expect, it } from "vitest";
import { can, type Action } from "./permissions";

const WRITE: Action[] = ["publish", "markReady", "approve", "sendBack", "rollBack", "removeGate", "assign", "confirmRights", "exportProject", "fixChecks", "lock", "openEditors", "createProject", "createStudio", "viewTemplates", "review", "invite", "createAsset", "moveAsset", "manageMembers", "setTraining", "viewBilling", "connectTools", "renameProject", "deleteProject"];

describe("permissions", () => {
  it("a viewer can only read, comment, and download images", () => {
    for (const a of WRITE) expect(can(a, "viewer"), a).toBe(false);
    expect(can("comment", "viewer")).toBe(true);
    expect(can("downloadImages", "viewer")).toBe(true);
    expect(can("exportAsset", "viewer")).toBe(true);
    expect(can("viewPeople", "viewer")).toBe(true);
    expect(can("pin", "viewer")).toBe(true);
    expect(can("ask", "viewer")).toBe(true);
    // Settings holds the viewer's own account, nothing of the studio's.
    expect(can("viewSettings", "viewer")).toBe(true);
  });

  it("artists publish and mark ready but do not review or invite", () => {
    expect(can("publish", "artist")).toBe(true);
    expect(can("markReady", "artist")).toBe(true);
    expect(can("approve", "artist")).toBe(false);
    expect(can("removeGate", "artist")).toBe(false);
    expect(can("invite", "artist")).toBe(false);
    expect(can("viewTemplates", "artist")).toBe(true);
    expect(can("createProject", "artist")).toBe(true);
    expect(can("review", "artist")).toBe(true);
  });

  it("art directors review, producers administer", () => {
    expect(can("approve", "art_director")).toBe(true);
    expect(can("removeGate", "art_director")).toBe(true);
    expect(can("invite", "art_director")).toBe(false);
    expect(can("invite", "producer")).toBe(true);
    expect(can("approve", "producer")).toBe(true);
    expect(can("setTraining", "art_director")).toBe(false);
    expect(can("createAsset", "art_director")).toBe(true);
    expect(can("deleteProject", "producer")).toBe(true);
  });
});
