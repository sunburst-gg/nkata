// Comments beside the model. A pinned one carries the commenter's dot; clicking it highlights
// its pin. The plain input at the end posts an unpinned comment.
import { useStore } from "@/app/store";
import { useCan } from "@/auth/useCan";
import type { Asset, Comment } from "@/data/types";
import { post } from "./Composer";

export function CommentList({ asset, comments }: { asset: Asset; comments: Comment[] }) {
  const activePin = useStore((s) => s.activePin);
  const pendingPin = useStore((s) => s.pendingPin);
  const draft = useStore((s) => s.draft);
  const canComment = useCan("comment");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <span style={{ fontSize: 13, color: "var(--ink60)" }}>Comments</span>
      {comments.map((c) => {
        const active = activePin === c.id;
        return (
          <div key={c.id} role={c.pin ? "button" : undefined} tabIndex={c.pin ? 0 : undefined} onClick={() => useStore.setState({ activePin: c.pin ? c.id : null })} className="nk-nav" style={{ display: "flex", gap: 10, padding: 8, margin: -8, borderRadius: "var(--r-6)", cursor: c.pin ? "pointer" : "default", background: active ? "var(--hover)" : "transparent" }}>
            <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: "50%", background: c.author.color, color: "var(--on-color)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, flexShrink: 0 }}>{c.author.initial}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontWeight: 500, color: "var(--ink)" }}>{c.author.first}</span>
                <span style={{ color: "var(--ink40)" }}>{c.at}</span>
                {c.pin ? <span aria-label="Pinned" style={{ marginLeft: "auto", width: 16, height: 16, borderRadius: "50%", background: c.author.color, boxShadow: "0 0 0 2px var(--raised)" }} /> : null}
              </span>
              <span style={{ color: "var(--ink80)" }}>{c.text}</span>
            </div>
          </div>
        );
      })}
      {canComment && !pendingPin ? (
        <input value={draft} onChange={(e) => useStore.setState({ draft: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") void post(asset); }} placeholder="Write a comment" aria-label="Write a comment" style={{ height: 40, borderRadius: "var(--r-6)", border: 0, background: "var(--raised)", boxShadow: "var(--shadow)", padding: "0 12px", fontSize: 15, color: "var(--ink)" }} />
      ) : null}
    </div>
  );
}
