// Switching the mock user to viewer removes every write action. Rendered server side so the
// check reads the DOM every route produces, with no browser.
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { AppRoutes } from "./App";
import { TooltipProvider } from "./components/Tooltip";
import { useStore } from "./store";

const ROUTES = ["/home", "/profile", "/p/rising-sun", "/p/rising-sun/a/ojukwu", "/p/rising-sun/a/ojukwu/face", "/p/rising-sun/a/kettle", "/p/rising-sun/changes", "/p/rising-sun/people", "/p/rising-sun/templates", "/p/rising-sun/settings", "/join", "/join/start"];
// Screens with the app header show the Viewer label beside the avatar. Setup screens have no header.
const HEADERLESS = ["/join", "/join/start"];
// Control labels, as they sit inside a button or menu item.
const WRITE_WORDS = [">Publish<", ">Mark Ready<", ">Approve<", ">Send back<", ">Roll back<", ">Remove gate<", ">Assign<", ">Export<", ">Fix<", ">Open in Blender<", ">Open in UE5<", ">New project<", ">Review<", ">Templates<", ">Settings<", ">Invite<"];

function render(path: string): string {
  return renderToString(<TooltipProvider><MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter></TooltipProvider>);
}

describe("viewer role", () => {
  it("renders no disabled control and no write action on any screen", () => {
    useStore.getState().switchRole("viewer");
    useStore.getState().setRail(true);
    for (const path of ROUTES) {
      const html = render(path);
      expect(html, path).not.toMatch(/\sdisabled(=""|\s|>)/);
      expect(html, path).not.toMatch(/aria-disabled="true"/);
      for (const w of WRITE_WORDS) expect(html, `${path} shows ${w}`).not.toContain(w);
      if (!html) expect(["/p/rising-sun/templates", "/p/rising-sun/settings"], `${path} rendered nothing`).toContain(path);
      else if (!HEADERLESS.includes(path)) expect(html, path).toContain("Viewer");
    }
    expect(render("/p/rising-sun")).toContain("14 changed this week");
    expect(render("/p/rising-sun/a/ojukwu")).toContain("Download images");
    expect(render("/p/rising-sun/a/ojukwu")).toContain("Comment");
    expect(render("/p/rising-sun/changes")).toContain("Open Nkata on this page");
    expect(render("/p/rising-sun/a/kettle")).toContain("No preview yet");
  });

  it("an artist sees the write actions a viewer does not", () => {
    useStore.getState().switchRole("artist");
    useStore.getState().setRail(true);
    const part = render("/p/rising-sun/a/ojukwu/face");
    expect(part).toContain("Mark Ready");
    expect(part).toContain("Open in Blender");
    expect(part).toContain(">Fix<");
    expect(render("/p/rising-sun")).toContain("5 online · 14 changed today · 4 ready for review");
    expect(render("/p/rising-sun")).toContain(">Review<");
    expect(render("/home")).toContain("New project");
    expect(render("/p/rising-sun/a/ojukwu")).toContain(">Export<");
    expect(render("/p/rising-sun/a/ojukwu")).not.toContain("Download images");
  });
});
