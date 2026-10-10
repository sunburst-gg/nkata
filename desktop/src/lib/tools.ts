// The Tools step: what the window shows for Blender and Unreal from the agent's report and the
// install results. Pure, so the words are tested without Tauri (tools.test.ts).

export interface BlenderInstall {
  exe: string;
  version: string;
}

export interface ToolsReport {
  blender: BlenderInstall | null;
  uprojects: string[];
  addon_shipped: boolean;
  plugin_shipped: boolean;
}

export type InstallState = { kind: "idle" } | { kind: "busy" } | { kind: "done"; line: string } | { kind: "failed"; line: string };

export type ToolAction = { kind: "detect" } | { kind: "install_blender" } | { kind: "install_ue"; uproject: string };

export interface ToolRow {
  id: string;
  tool: "Blender" | "Unreal Engine";
  value: string;
  note: string;
  busy: boolean;
  button: { label: string; action: ToolAction } | null;
}

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function describeTools(report: ToolsReport | null, addon: InstallState, plugins: Record<string, InstallState>): ToolRow[] {
  const rows: ToolRow[] = [];
  const again = { label: "Find again", action: { kind: "detect" } as const };
  if (!report) {
    rows.push({ id: "blender", tool: "Blender", value: "Looking", note: "", busy: true, button: null });
    rows.push({ id: "unreal", tool: "Unreal Engine", value: "Looking", note: "", busy: true, button: null });
    return rows;
  }
  if (!report.blender) {
    rows.push({ id: "blender", tool: "Blender", value: "Not found", note: "Install Blender 4.2 or newer, then press Find again.", busy: false, button: again });
  } else if (!report.addon_shipped) {
    rows.push({ id: "blender", tool: "Blender", value: report.blender.version, note: "This build has no add-on to install.", busy: false, button: null });
  } else {
    const install = { label: "Install add-on", action: { kind: "install_blender" } as const };
    switch (addon.kind) {
      case "idle":
        rows.push({ id: "blender", tool: "Blender", value: report.blender.version, note: "Add-on not installed yet.", busy: false, button: install });
        break;
      case "busy":
        rows.push({ id: "blender", tool: "Blender", value: report.blender.version, note: "Installing the add-on.", busy: true, button: null });
        break;
      case "done":
        rows.push({ id: "blender", tool: "Blender", value: report.blender.version, note: "Add-on installed and on. Press N in the 3D viewport.", busy: false, button: null });
        break;
      case "failed":
        rows.push({ id: "blender", tool: "Blender", value: report.blender.version, note: addon.line, busy: false, button: { label: "Try again", action: { kind: "install_blender" } } });
        break;
    }
  }
  if (report.uprojects.length === 0) {
    rows.push({ id: "unreal", tool: "Unreal Engine", value: "No project in the folder", note: "Create or move your Unreal project inside the project folder, then press Find again.", busy: false, button: again });
    return rows;
  }
  for (const uproject of report.uprojects) {
    const state = plugins[uproject] ?? { kind: "idle" };
    const install = { label: "Install plugin", action: { kind: "install_ue", uproject } as const };
    const base = { id: `ue:${uproject}`, tool: "Unreal Engine" as const, value: baseName(uproject).replace(/\.uproject$/, "") };
    if (!report.plugin_shipped) rows.push({ ...base, note: "This build has no plugin to install.", busy: false, button: null });
    else if (state.kind === "idle") rows.push({ ...base, note: "Plugin not installed yet.", busy: false, button: install });
    else if (state.kind === "busy") rows.push({ ...base, note: "Installing the plugin.", busy: true, button: null });
    else if (state.kind === "done") rows.push({ ...base, note: "Plugin installed, Python and Remote Control on. Open the project once to finish.", busy: false, button: null });
    else rows.push({ ...base, note: state.line, busy: false, button: { label: "Try again", action: install.action } });
  }
  return rows;
}
