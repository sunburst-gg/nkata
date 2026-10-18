// The three decisions end to end on the mock: the artist fixes the red check, writes a note
// and publishes; the lead's Needs my eyes count goes up by one; Approve seals it; Request
// changes needs a pin or a line.
import { describe, expect, it } from "vitest";
import { MockDataSource, RISING_SUN } from "@/data/mock";
import { filterCounts, isApproved, needsMe, publishState, waitingOnLead } from "./selectors";

describe("publish, approve, request changes", () => {
  it("artist: fix the red check, write a note, publish; the lead sees one more", async () => {
    const artist = new MockDataSource({ stage: "studio", role: "artist" });
    const lead = new MockDataSource({ stage: "studio", role: "lead" });
    const before = filterCounts(await lead.listAssets(RISING_SUN.id), lead.me).find((f) => f.name === "Needs my eyes")!.count;
    const bad = (await artist.listAssets(RISING_SUN.id))[12]!;
    expect(publishState(bad, "Chipped the paint.").label).toBe("Publish, after the red one");
    await expect(artist.publish(bad.id, "Chipped the paint.")).rejects.toThrow("red check");
    await artist.fixCheck(bad.id, "tris");
    const events: string[] = [];
    artist.subscribe((e) => events.push(e.type));
    await artist.publish(bad.id, "Chipped the paint.");
    expect(events).toEqual(["published"]);
    const after = (await artist.getAsset(bad.id))!;
    expect(after.versions[0]).toMatchObject({ n: bad.versions[0]!.n + 1, note: "Chipped the paint.", approved: false });
    expect(after.live).toBeUndefined();
    expect(waitingOnLead(after)).toBe(true);
    // The same change seen by the lead's mock: one more waits on them.
    await lead.fixCheck(bad.id, "tris");
    await lead.publish(bad.id, "Chipped the paint.");
    const assets = await lead.listAssets(RISING_SUN.id);
    expect(needsMe(assets, lead.me)).toHaveLength(before + 1);
  });
  it("lead: Approve seals the Version; the mock keeps it", async () => {
    const lead = new MockDataSource({ stage: "studio", role: "lead" });
    const waiting = (await lead.listAssets(RISING_SUN.id)).find((a) => waitingOnLead(a))!;
    await lead.approve(waiting.id, waiting.versions[0]!.n);
    const after = (await lead.getAsset(waiting.id))!;
    expect(isApproved(after)).toBe(true);
    expect(waitingOnLead(after)).toBe(false);
    expect((await lead.listAssets(RISING_SUN.id)).filter(isApproved).length).toBe(12);
  });
  it("lead: Request changes sends it back and it leaves the inbox", async () => {
    const lead = new MockDataSource({ stage: "studio", role: "lead" });
    const waiting = (await lead.listAssets(RISING_SUN.id)).find((a) => waitingOnLead(a))!;
    await lead.comment(waiting.id, "Too new for this yard.", [0, 1, 0]);
    await lead.requestChanges(waiting.id, waiting.versions[0]!.n);
    const after = (await lead.getAsset(waiting.id))!;
    expect(after.versions[0]!.changesRequested).toBe(true);
    expect(waitingOnLead(after)).toBe(false);
  });
});
