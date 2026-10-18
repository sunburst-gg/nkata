import { describe, expect, it } from "vitest";
import type { Asset } from "@/data/types";
import { byLastChange, cleanFolderName, folderNames, listAssets } from "./list";

function asset(name: string, extra: Partial<Asset> = {}): Asset {
  return { id: name, slug: name.toLowerCase(), projectSlug: "p", name, kind: "Props", state: "draft", render: null, meta: "", ownerId: "", present: [], parts: [], template: "Environment prop", usedIn: [], changedOrder: 0, when: "", rights: null, folder: "", ...extra };
}

describe("the project list", () => {
  const assets = [
    asset("Kettle", { folder: "Market", changedOrder: 2, state: "approved" }),
    asset("Ojukwu", { template: "Character", changedOrder: 1, state: "ready" }),
    asset("Stall", { folder: "Market", changedOrder: 0 }),
    asset("Square", { folder: "Levels", template: "Level area", changedOrder: 3 }),
  ];

  it("lists folders once each, in order, without the root", () => {
    expect(folderNames(assets)).toEqual(["Levels", "Market"]);
    expect(folderNames([])).toEqual([]);
  });

  it("shows every asset newest first, or one folder, or the root", () => {
    expect(listAssets(assets, { folder: null, query: "", ready: false }).map((a) => a.name)).toEqual(["Stall", "Ojukwu", "Kettle", "Square"]);
    expect(listAssets(assets, { folder: "Market", query: "", ready: false }).map((a) => a.name)).toEqual(["Stall", "Kettle"]);
    expect(listAssets(assets, { folder: "", query: "", ready: false }).map((a) => a.name)).toEqual(["Ojukwu"]);
  });

  it("matches the search against the name and the template tag", () => {
    expect(listAssets(assets, { folder: null, query: "char", ready: false }).map((a) => a.name)).toEqual(["Ojukwu"]);
    expect(listAssets(assets, { folder: null, query: "  KET ", ready: false }).map((a) => a.name)).toEqual(["Kettle"]);
    expect(listAssets(assets, { folder: null, query: "prop", ready: false })).toHaveLength(2);
  });

  it("the review inbox keeps only Ready assets, inside any folder", () => {
    expect(listAssets(assets, { folder: null, query: "", ready: true }).map((a) => a.name)).toEqual(["Ojukwu"]);
    expect(listAssets(assets, { folder: "Market", query: "", ready: true })).toEqual([]);
  });

  it("orders by the change time when the source gives one", () => {
    const old = asset("Old", { changedAt: "2026-10-01T00:00:00Z", changedOrder: 0 });
    const fresh = asset("Fresh", { changedAt: "2026-10-14T00:00:00Z", changedOrder: 1 });
    expect([old, fresh].sort(byLastChange).map((a) => a.name)).toEqual(["Fresh", "Old"]);
  });

  it("cleans a folder name and refuses a path", () => {
    expect(cleanFolderName("  Market set ")).toBe("Market set");
    expect(cleanFolderName("")).toBeNull();
    expect(cleanFolderName("a/b")).toBeNull();
    expect(cleanFolderName("x".repeat(61))).toBeNull();
  });
});
