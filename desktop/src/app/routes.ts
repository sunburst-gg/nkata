// A state router. The screen lives in the store; this names each one and its placeholder title
// until its own step builds it. Screens: zeroStudio, zeroProject, arrival, project, asset,
// mentions, connections, newProject, plus signIn, settings and projectSettings from step 8.
import type { Screen } from "./store";

export const SCREENS: Screen[] = ["zeroStudio", "zeroProject", "arrival", "project", "asset", "mentions", "connections", "newProject", "signIn", "settings", "projectSettings"];

/** Screens that draw without the shell: the zero states, arrival and sign in. */
export const BARE: ReadonlySet<Screen> = new Set<Screen>(["zeroStudio", "zeroProject", "arrival", "signIn"]);

export const TITLE: Record<Screen, string> = {
  zeroStudio: "Name your studio.",
  zeroProject: "Start your first project.",
  arrival: "Arrival",
  project: "",
  asset: "",
  mentions: "Mentions",
  connections: "Connections",
  newProject: "New project",
  signIn: "Sign in",
  settings: "Settings",
  projectSettings: "Project settings",
};
