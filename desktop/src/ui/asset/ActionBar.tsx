// Directly under the stage, labeled with the picked Version. Leads: Approve (amber) and Request
// changes, only when the Version can be reviewed. Artists: Publish. Download and Open in Blender
// as icon buttons for roles that can use them. The bar follows the selected Version.
import { useStore } from "@/app/store";
import { canPublishHere, canReview } from "@/app/selectors";
import { useCan } from "@/auth/useCan";
import type { Asset, Comment } from "@/data/types";

const NONE: Comment[] = [];
import { toast } from "@/ui/toast/toast";

const icon: React.CSSProperties = { width: 36, height: 36, borderRadius: "var(--r-6)", background: "var(--raised)", boxShadow: "var(--shadow)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--ink)", border: 0, padding: 0 };
const button: React.CSSProperties = { height: 36, padding: "0 14px", borderRadius: "var(--r-6)", border: 0, font: "500 14px var(--sans)", cursor: "pointer", whiteSpace: "nowrap" };

export function ActionBar({ asset, shown, onApprove, onRequestChanges, onPublish }: { asset: Asset; shown: number | "live"; onApprove: () => void; onRequestChanges: () => void; onPublish: () => void }) {
  const me = useStore((s) => s.me);
  const source = useStore((s) => s.source);
  const comments = useStore((s) => s.comments[asset.id] ?? NONE);
  const approve = useCan("approve");
  const requestChanges = useCan("requestChanges");
  // Publish here is the artist's; a lead publishes from Blender like anyone else but reviews
  // from this bar, as the prototype draws it (docs/decisions.md, v8 step 5).
  const saved = asset.versions.length > 0;
  // Only the owner publishes their own asset (v8 step 16); the server refuses anyone else.
  const publish = !!me && canPublishHere(asset, me);
  const download = useCan("download");
  const downloadImage = useCan("downloadImage");
  const openInBlender = useCan("openInBlender");
  const v = shown === "live" ? null : asset.versions.find((x) => x.n === shown);
  const shownN = shown === "live" ? (asset.versions[0]?.n ?? 1) : shown;
  const label = !saved ? `Nothing saved yet. ${asset.owner.first}'s first save shows here.` : shown === "live" ? `Live, ${asset.owner.first} is saving` : `v${shown} by ${asset.owner.first}, ${v?.publishedAt ?? ""}`;
  const reviewable = canReview(asset, shown);
  const myPin = comments.some((c) => c.pin && c.author.id === me?.id);
  const myLine = comments.some((c) => c.author.id === me?.id);
  const doDownload = async (format: "glb" | "image") => {
    if (!source) return;
    const file = await source.download(asset.id, format, shownN);
    if (!file) return;
    toast(format === "image" ? `Saved ${file}.` : `Downloading ${file} with textures.`, me?.color ?? "var(--ok)");
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 4px", marginTop: -12 }}>
      <span style={{ fontSize: 13, color: "var(--ink)" }}>{label}</span>
      <span style={{ flex: 1 }} />
      {requestChanges && reviewable ? <button type="button" onClick={onRequestChanges} style={{ ...button, background: "var(--raised)", boxShadow: "var(--shadow)", color: myPin || myLine ? "var(--bad)" : "var(--ink)" }}>Request changes</button> : null}
      {approve && reviewable ? <button type="button" onClick={onApprove} style={{ ...button, background: "var(--amber)", color: "var(--amber-fg)" }}>Approve v{shownN}</button> : null}
      {publish ? <button type="button" onClick={onPublish} style={{ ...button, background: "var(--amber)", color: "var(--amber-fg)" }}>Publish</button> : null}
      {download && saved ? (
        <button type="button" title={`Download v${shownN}`} aria-label={`Download v${shownN}`} onClick={() => void doDownload("glb")} style={icon}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 2v8M4.5 6.5L8 10l3.5-3.5M3 13h10" /></svg>
        </button>
      ) : downloadImage && saved ? (
        <button type="button" title="Download image" aria-label="Download image" onClick={() => void doDownload("image")} style={icon}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 2v8M4.5 6.5L8 10l3.5-3.5M3 13h10" /></svg>
        </button>
      ) : null}
      {openInBlender && saved ? (
        <button type="button" title="Open in Blender" aria-label="Open in Blender" onClick={() => { void source?.openInBlender(asset.id, shownN); toast("Blender is opening with the Nkata panel.", me?.color ?? "var(--ok)"); }} style={icon}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M9 2h5v5M14 2L7 9M12 9.5V13a1 1 0 01-1 1H3a1 1 0 01-1-1V5a1 1 0 011-1h3.5" /></svg>
        </button>
      ) : null}
    </div>
  );
}
