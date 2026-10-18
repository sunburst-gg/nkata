// The viewer audit: every screen rendered as a viewer, on the mock, as static markup. It fails
// on any disabled or aria-disabled control (rule 4), and on any Blender status, Connections,
// setup, journey row, disk row or path reaching a viewer.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import type { StateCreator } from "zustand";

// The store sets the document theme on import; node has no document. Static markup needs none.
vi.stubGlobal("document", { documentElement: { setAttribute() { /* static markup */ }, dataset: {} } });
vi.stubGlobal("location", { search: "" });
vi.mock("@/viewer/nk-viewer.js", () => ({}));
// Static markup reads zustand's server snapshot, which is the state at create(); this test
// seeds the store after create(), so the server snapshot points at the live state instead.
vi.mock("zustand", async (importOriginal) => {
  const z = await importOriginal<typeof import("zustand")>();
  const create = (init: StateCreator<unknown>) => {
    const api = z.createStore(init);
    api.getInitialState = api.getState;
    const hook = (selector: (s: unknown) => unknown) => z.useStore(api, selector);
    return Object.assign(hook, api);
  };
  return { ...z, create };
});

const { useStore } = await import("@/app/store");
const { MockDataSource, RISING_SUN } = await import("@/data/mock");
const { App } = await import("@/App");
const { AppShell } = await import("@/ui/shell/AppShell");
const { Wall } = await import("@/screens/Wall");
const { AssetScreen } = await import("@/screens/Asset");
const { MentionsScreen } = await import("@/screens/Mentions");
const { SettingsScreen } = await import("@/screens/Settings");
const { ProjectSettingsScreen } = await import("@/screens/ProjectSettings");
const { ConnectionsScreen } = await import("@/screens/Connections");
const { Arrival } = await import("@/screens/Arrival");
const { SignIn } = await import("@/screens/SignIn");
const { Zero } = await import("@/screens/Zero");

// Controls and words a viewer never meets. "Approved" (the chip, the seal) and "until Publish" (a note) are copy, not controls.
const BANNED_FOR_VIEWERS = [/Connections/, /Open in Blender/, /Open Blender/, /Show in Finder/, /Sync again/, /Nkata add-on/, /~\//, /\/Users\//, /Invite people/, /New project/, /Publish v|>Publish</, /Approve v|>Approve</, /Request changes/, /Set a budget/, /Budgets/];

async function viewerStore(stage: "studio" | "empty" | "arrival") {
  const mock = new MockDataSource({ stage, role: "viewer" });
  useStore.setState({ projectId: RISING_SUN.id, assetId: stage === "studio" ? `${RISING_SUN.id}/radio` : null, screen: "project" });
  await useStore.getState().boot(mock, mock.me, stage);
  return mock;
}

const html = (el: ReactElement) => renderToStaticMarkup(el);

describe("a viewer never meets a disabled control or a Blender word", () => {
  const screens: [string, () => ReactElement][] = [
    ["shell with the wall", () => <AppShell><Wall /></AppShell>],
    ["asset", () => <AppShell><AssetScreen /></AppShell>],
    ["mentions", () => <AppShell><MentionsScreen /></AppShell>],
    ["settings", () => <AppShell><SettingsScreen /></AppShell>],
    ["project settings", () => <AppShell><ProjectSettingsScreen /></AppShell>],
    ["connections", () => <AppShell><ConnectionsScreen /></AppShell>],
    ["sign in", () => <SignIn />],
    ["zero", () => <Zero which="project" />],
    ["app", () => <App />],
  ];
  for (const [name, el] of screens) {
    it(`${name}: nothing disabled, nothing of Blender`, async () => {
      await viewerStore("studio");
      const out = html(el());
      expect(out).not.toMatch(/ disabled(=|>| )/);
      expect(out).not.toMatch(/aria-disabled="true"/);
      const text = out.replace(/<(?!\/?button)[^>]+>/g, " ").replace(/<button[^>]*>/g, ">").replace(/<\/button>/g, "<");
      for (const re of BANNED_FOR_VIEWERS) { const m = text.match(re); expect(m ? text.slice(Math.max(0, m.index! - 60), m.index! + 60) : "", `${name} shows ${re}`).toBe(""); }
    });
  }
  it("arrival for a viewer: no setup list, one button", async () => {
    await viewerStore("arrival");
    const out = html(<Arrival />);
    expect(out).not.toMatch(/aria-label="Setup"/);
    expect(out).not.toMatch(/Blender/);
    expect(out).toMatch(/Look at it/);
    expect(out).not.toMatch(/ disabled(=|>| )/);
  });
  it("the viewer tag and Download image are what a viewer gets on the asset page", async () => {
    await viewerStore("studio");
    const out = html(<AppShell><AssetScreen /></AppShell>);
    expect(out).toMatch(/Download image/);
    expect(out).not.toMatch(/aria-label="Download"[^>]*>/);
    expect(out).toMatch(/>Viewer</);
  });
  it("the journey row and the Mine chip stay away from a viewer", async () => {
    await viewerStore("empty");
    const out = html(<AppShell><Wall /></AppShell>);
    expect(out).not.toMatch(/Invite your artists|Waiting for/);
    expect(out).not.toMatch(/>Mine</);
  });
});
