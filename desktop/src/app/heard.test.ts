// What the owner of an asset hears when someone else acts on it (heard.ts, v8 step 16).
import { describe, expect, it } from "vitest";

import { heardLine } from "./heard";
import { ME, MockDataSource, RISING_SUN } from "@/data/mock";

describe("the owner hears the lead", () => {
  it("an approval, a send back with its open pins, and a new comment by someone else; nothing for my own or a pin marked done", async () => {
    const mock = new MockDataSource({ stage: "studio", role: "artist" });
    const assets = await mock.listAssets(RISING_SUN.id);
    const members = await mock.listMembers(RISING_SUN.id);
    const mine = assets.find((a) => a.owner.id === ME.artist.id)!;
    const theirs = assets.find((a) => a.owner.id !== ME.artist.id)!;
    const s = { me: ME.artist, assets: [{ ...mine, pins: { open: 2, total: 3 } }, theirs], members };
    const lead = ME.lead.id;
    expect(heardLine({ type: "approved", assetId: mine.id, version: 2, by: lead }, s)?.text).toBe(`Emeka approved v2 of ${mine.name}.`);
    expect(heardLine({ type: "changesRequested", assetId: mine.id, version: 2, by: lead }, s)?.text).toBe(`Emeka sent v2 of ${mine.name} back. 2 pins to look at.`);
    expect(heardLine({ type: "commented", assetId: mine.id, commentId: "c", by: lead }, s)?.text).toBe(`Emeka commented on ${mine.name}.`);
    expect(heardLine({ type: "commented", assetId: mine.id, commentId: "c", by: lead, settled: true }, s)).toBeNull();
    expect(heardLine({ type: "approved", assetId: mine.id, version: 2 }, s)).toBeNull();
    expect(heardLine({ type: "approved", assetId: mine.id, version: 2, by: ME.artist.id }, s)).toBeNull();
    expect(heardLine({ type: "approved", assetId: theirs.id, version: 1, by: lead }, s)).toBeNull();
  });
  it("a save of my asset by someone else, since it replaces the file on my computer; nothing for my own save or theirs", async () => {
    const mock = new MockDataSource({ stage: "studio", role: "artist" });
    const assets = await mock.listAssets(RISING_SUN.id);
    const members = await mock.listMembers(RISING_SUN.id);
    const mine = assets.find((a) => a.owner.id === ME.artist.id)!;
    const theirs = assets.find((a) => a.owner.id !== ME.artist.id)!;
    const s = { me: ME.artist, assets, members };
    expect(heardLine({ type: "saved", assetId: mine.id, by: ME.lead.id }, s)?.text).toBe(`Emeka saved ${mine.name}. Your copy has their change. Your last save is in Versions.`);
    expect(heardLine({ type: "saved", assetId: mine.id, by: ME.artist.id }, s)).toBeNull();
    expect(heardLine({ type: "saved", assetId: theirs.id, by: ME.lead.id }, s)).toBeNull();
  });
});
