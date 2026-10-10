import { describe, expect, it } from "vitest";
import { baseName, describeTools, type ToolsReport } from "./tools";

const found: ToolsReport = { blender: { exe: "/Applications/Blender.app/Contents/MacOS/Blender", version: "4.2.3 LTS" }, uprojects: ["/Users/nj/Projects/Rising Sun/RisingSunUE/RisingSun.uproject"], addon_shipped: true, plugin_shipped: true };

describe("describeTools", () => {
  it("says it is looking before the report arrives", () => {
    const rows = describeTools(null, { kind: "idle" }, {});
    expect(rows.map((r) => r.value)).toEqual(["Looking", "Looking"]);
    expect(rows.every((r) => r.busy && r.button === null)).toBe(true);
  });

  it("asks for Blender and an Unreal project when neither is found", () => {
    const rows = describeTools({ blender: null, uprojects: [], addon_shipped: true, plugin_shipped: true }, { kind: "idle" }, {});
    expect(rows[0]).toMatchObject({ tool: "Blender", value: "Not found", button: { label: "Find again", action: { kind: "detect" } } });
    expect(rows[1]).toMatchObject({ tool: "Unreal Engine", value: "No project in the folder", button: { label: "Find again" } });
  });

  it("walks the add-on through install, done, and a failure with a retry", () => {
    expect(describeTools(found, { kind: "idle" }, {})[0]).toMatchObject({ value: "4.2.3 LTS", note: "Add-on not installed yet.", button: { label: "Install add-on", action: { kind: "install_blender" } } });
    expect(describeTools(found, { kind: "busy" }, {})[0]).toMatchObject({ busy: true, button: null });
    expect(describeTools(found, { kind: "done", line: "STATUS Installed" }, {})[0]!.note).toContain("Press N");
    expect(describeTools(found, { kind: "failed", line: "Blender could not install the add-on: repository not found" }, {})[0]).toMatchObject({ note: "Blender could not install the add-on: repository not found", button: { label: "Try again" } });
  });

  it("lists each Unreal project by name with its own install state", () => {
    const uproject = found.uprojects[0]!;
    expect(describeTools(found, { kind: "idle" }, {})[1]).toMatchObject({ value: "RisingSun", note: "Plugin not installed yet.", button: { label: "Install plugin", action: { kind: "install_ue", uproject } } });
    expect(describeTools(found, { kind: "idle" }, { [uproject]: { kind: "done", line: "" } })[1]!.note).toContain("Remote Control on");
    expect(describeTools(found, { kind: "idle" }, { [uproject]: { kind: "failed", line: "io error" } })[1]).toMatchObject({ note: "io error", button: { label: "Try again" } });
  });

  it("says so when a build shipped without the tools", () => {
    const rows = describeTools({ ...found, addon_shipped: false, plugin_shipped: false }, { kind: "idle" }, {});
    expect(rows[0]).toMatchObject({ note: "This build has no add-on to install.", button: null });
    expect(rows[1]).toMatchObject({ note: "This build has no plugin to install.", button: null });
  });

  it("takes the file name from either slash", () => {
    expect(baseName("C:\\Projects\\RS\\RS.uproject")).toBe("RS.uproject");
    expect(baseName("/a/b/RS.uproject")).toBe("RS.uproject");
  });
});
