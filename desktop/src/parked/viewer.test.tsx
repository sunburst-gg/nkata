// Switching the mock user to viewer removes every write action. Rendered server side so the
// check reads the DOM every route produces, with no browser.
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { AppRoutes } from "./App";
import { TooltipProvider } from "./components/Tooltip";
import { useStore } from "./store";

const RS = "/p/rising-sun";
const ROUTES = ["/welcome", "/connections", "/mentions", RS, `${RS}/board`, `${RS}/a/ojukwu`, `${RS}/a/ojukwu/face`, "/p/nkatatest/a/market-stall", "/settings/account", "/settings/members", "/settings/connections", "/settings/general"];
// The settings shell has no header, so no Viewer label there.
const HEADERLESS = ["/settings/account", "/settings/members", "/settings/connections", "/settings/general"];
// Control labels, as they sit inside a button, a menu item, or a nav row.
const WRITE_WORDS = [">Publish<", ">Mark Ready<", ">Approve<", ">Send back<", ">Roll back<", ">Remove gate<", ">Assign<", ">Export<", ">Fix<", ">Open in Blender<", ">Open in Unreal<", ">New project<", ">Review<", ">Connect<", ">Add<", ">Invite members<", ">Billing<", ">Delete project<", ">Create asset<", ">Open folder<", ">Move to<", ">New folder<", "Studio name"];

function render(path: string): string {
  const html = renderToString(<TooltipProvider><MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter></TooltipProvider>);
  // The Welcome cards hold a picture of the app, not controls.
  return html.replace(/<div class="wc-scene">[\s\S]*?<div class="wc-caption">/g, "");
}

describe("viewer role", () => {
  beforeEach(() => {
    useStore.getState().setStage("populated");
    useStore.getState().setRail(true);
    useStore.getState().setTab("All");
  });

  it("renders no disabled control and no write action on any screen", () => {
    useStore.getState().switchRole("viewer");
    for (const path of ROUTES) {
      const html = render(path);
      expect(html, path).not.toMatch(/\sdisabled(=""|\s|>)/);
      expect(html, path).not.toMatch(/aria-disabled="true"/);
      for (const w of WRITE_WORDS) expect(html, `${path} shows ${w}`).not.toContain(w);
      expect(html, `${path} rendered nothing`).not.toBe("");
      if (!HEADERLESS.includes(path)) expect(html, path).toContain(">Viewer<");
    }
    expect(render(RS)).toContain("12 changed this week");
    expect(render(`${RS}/a/ojukwu`)).toContain("Download images");
    expect(render(`${RS}/a/ojukwu`)).toContain("Pin a comment");
    expect(render(`${RS}/a/ojukwu`)).toContain("Write a comment");
    expect(render(`${RS}/a/ojukwu/face`)).toContain(">Checks<");
    expect(render(`${RS}/a/ojukwu/face?compare=2`)).toContain(">What changed<");
    expect(render("/settings/account")).not.toContain(">Billing<");
    // A viewer who lands on /new gets the breadcrumb and nothing to fill in.
    expect(render("/new")).not.toContain(">Create project<");
  });

  it("a producer sees the write actions a viewer does not", () => {
    useStore.getState().switchRole("artist");
    const part = render(`${RS}/a/ojukwu/face`);
    expect(part).toContain("Open in Blender");
    expect(part).toContain(">Fix<");
    // The note leads, the card carries the numbers and the delta from the publish before.
    expect(part).toContain("Roof reworked, cloth softer. Textures final.");
    expect(part).toContain(">Triangles<");
    expect(part).toContain("+1,200");
    expect(part).toContain("checks block");
    expect(part).toContain("Ojukwu / face");
    const project = render(RS);
    expect(project).toContain("3 online · 12 changed today · 2 ready for review");
    expect(project).toContain(">Review<");
    expect(project).not.toContain("Training");
    expect(project).toContain("~/Documents/Nkata/Rising Sun");
    expect(render("/welcome")).toContain("New project");
    expect(render("/welcome")).toContain("Welcome, Emmanuel");
    expect(render(`${RS}/a/ojukwu`)).toContain(">Export<");
    expect(render(`${RS}/a/ojukwu`)).toContain(">Remove gate<");
    expect(render(`${RS}/a/ojukwu`)).not.toContain("Download images");
    expect(render("/settings/billing")).toContain("Free while Nkata is in testing");
    expect(render("/settings/billing")).not.toContain("Training");
    expect(render("/welcome")).not.toContain("Training");
    expect(render("/mentions")).toContain("remove the gate on textures");
    // Compare: the facts from the two manifests and the renders under a wipe.
    const compare = render(`${RS}/a/ojukwu/face?compare=2`);
    expect(compare).toContain(">What changed<");
    expect(compare).toContain("face_mesh changed");
    expect(compare).toContain("Material M_face_detail added");
    expect(compare).toContain("Drag to wipe");
    expect(render(`${RS}/a/enugu-market`)).toContain(">Walk<");
    expect(render(`${RS}/a/ojukwu`)).not.toContain(">Walk<");
    useStore.getState().setStage("connected");
    expect(render("/connections")).toContain(">Connect<");
    expect(render("/connections")).toContain("Coming soon");
    expect(render("/connections")).toContain("Blender to Unreal mirror ships next.");
  });

  it("the first run reaches every empty state", () => {
    useStore.getState().switchRole("artist");
    useStore.getState().setStage("fresh");
    expect(render("/welcome")).toContain("No projects yet.");
    useStore.getState().setStage("connected");
    expect(render("/p/nkatatest")).toContain("No assets yet");
    expect(render("/p/nkatatest")).toContain(">Create asset<");
    useStore.getState().setStage("firstAsset");
    expect(render("/p/nkatatest")).toContain("Market stall");
    expect(render("/p/nkatatest")).not.toContain("changed today");
  });
});
