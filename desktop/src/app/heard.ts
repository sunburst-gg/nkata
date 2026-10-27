// Pure, so it tests without the store or a document.
import type { DataEvent } from "@/data/DataSource";
import type { Asset, Member, Person } from "@/data/types";

/**
 * What the owner of an asset hears when someone else acts on it through the server: an approval,
 * a send back, a new comment (v8 step 16, item 4). Nothing for my own actions, which toast where I
 * made them, and nothing for a pin marked done. A save of my asset by someone else (a lead may
 * send one) replaces the file on my computer, so I hear that too, and where my own save went.
 */
export function heardLine(e: DataEvent, s: { me: Person | null; assets: readonly Asset[]; members: readonly Member[] }): { text: string; color: string; thumb?: string; assetId: string } | null {
  if (e.type !== "approved" && e.type !== "changesRequested" && e.type !== "commented" && e.type !== "saved") return null;
  if (!s.me || !e.by || e.by === s.me.id) return null;
  if (e.type === "commented" && e.settled) return null;
  const asset = s.assets.find((a) => a.id === e.assetId);
  if (!asset || asset.owner.id !== s.me.id) return null;
  const who = s.members.find((m) => m.person.id === e.by)?.person.first ?? "Someone";
  const thumb = asset.render;
  if (e.type === "saved") return { text: `${who} saved ${asset.name}. Your copy has their change. Your last save is in Versions.`, color: "var(--ink)", thumb, assetId: asset.id };
  if (e.type === "approved") return { text: `${who} approved v${e.version} of ${asset.name}.`, color: "var(--ok)", thumb, assetId: asset.id };
  if (e.type === "changesRequested") {
    const open = asset.pins?.open ?? 0;
    const pins = open ? ` ${open} pin${open === 1 ? "" : "s"} to look at.` : "";
    return { text: `${who} sent v${e.version} of ${asset.name} back.${pins}`, color: "var(--bad)", thumb, assetId: asset.id };
  }
  return { text: `${who} commented on ${asset.name}.`, color: s.members.find((m) => m.person.id === e.by)?.person.color ?? "var(--ink)", thumb, assetId: asset.id };
}
