// Comments beside the model. A pinned one carries the commenter's dot; clicking it highlights
// its pin. Done pins sit under an Addressed fold and draw hollow (v8 step 14); the author, the
// asset's owner or a lead marks one done or reopens it. The plain input at the end posts an
// unpinned comment.
import { useState } from "react";
import { canResolve } from "@/app/selectors";
import { useStore } from "@/app/store";
import { useCan } from "@/auth/useCan";
import type { Asset, Comment } from "@/data/types";
import { post } from "./Composer";

export function CommentList({ asset, comments }: { asset: Asset; comments: Comment[] }) {
  const pendingPin = useStore((s) => s.pendingPin);
  const draft = useStore((s) => s.draft);
  const canComment = useCan("comment");
  const [addressedOpen, setAddressedOpen] = useState(false);
  const open = comments.filter((c) => !c.done);
  const addressed = comments.filter((c) => c.done);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <span style={{ fontSize: 13, color: "var(--ink60)" }}>Comments</span>
      {open.map((c) => <Row key={c.id} asset={asset} comment={c} />)}
      {addressed.length ? (
        <button type="button" aria-expanded={addressedOpen} onClick={() => setAddressedOpen((v) => !v)} style={{ alignSelf: "flex-start", border: 0, background: "transparent", padding: 0, font: "400 13px var(--sans)", color: "var(--ink60)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ transition: "transform var(--t-fast)", transform: addressedOpen ? "rotate(90deg)" : "none" }}><path d="M3.5 2l3 3-3 3" /></svg>
          Addressed · {addressed.length}
        </button>
      ) : null}
      {addressedOpen ? addressed.map((c) => <Row key={c.id} asset={asset} comment={c} />) : null}
      {canComment && !pendingPin ? (
        <input value={draft} onChange={(e) => useStore.setState({ draft: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") void post(asset); }} placeholder="Write a comment" aria-label="Write a comment" style={{ height: 40, borderRadius: "var(--r-6)", border: 0, background: "var(--raised)", boxShadow: "var(--shadow)", padding: "0 12px", fontSize: 15, color: "var(--ink)" }} />
      ) : null}
    </div>
  );
}

function Row({ asset, comment: c }: { asset: Asset; comment: Comment }) {
  const activePin = useStore((s) => s.activePin);
  const me = useStore((s) => s.me);
  const source = useStore((s) => s.source);
  const active = activePin === c.id;
  const mayResolve = !!me && canResolve(asset, c, me);
  const settle = async (e: React.MouseEvent, done: boolean) => {
    e.stopPropagation();
    if (!source) return;
    await source.resolveComment(asset.id, c.id, done);
    await useStore.getState().loadComments(asset.id);
  };
  return (
    <div role={c.pin ? "button" : undefined} tabIndex={c.pin ? 0 : undefined} onClick={() => useStore.setState({ activePin: c.pin ? c.id : null })} className="nk-nav" style={{ display: "flex", gap: 10, padding: 8, margin: -8, borderRadius: "var(--r-6)", cursor: c.pin ? "pointer" : "default", background: active ? "var(--hover)" : "transparent", opacity: c.done ? .7 : 1 }}>
      <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: "50%", background: c.author.color, color: "var(--on-color)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, flexShrink: 0 }}>{c.author.initial}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontWeight: 500, color: "var(--ink)" }}>{c.author.first}</span>
          <span style={{ color: "var(--ink40)" }}>{c.at}</span>
          {c.pin ? <span aria-label={c.done ? "Pin, done" : "Pinned"} style={{ marginLeft: "auto", width: 16, height: 16, borderRadius: "50%", background: c.done ? "var(--raised)" : c.author.color, boxShadow: c.done ? `inset 0 0 0 2.5px ${c.author.color}` : "0 0 0 2px var(--raised)" }} /> : null}
        </span>
        <span style={{ color: "var(--ink80)" }}>{c.text}</span>
        {mayResolve ? (
          <button type="button" onClick={(e) => void settle(e, !c.done)} style={{ alignSelf: "flex-start", marginTop: 4, height: 24, padding: "0 8px", borderRadius: "var(--r-6)", border: "1.5px solid var(--line)", background: "transparent", font: "500 12px var(--sans)", color: "var(--ink)", cursor: "pointer" }}>{c.done ? "Reopen" : "Done"}</button>
        ) : null}
      </div>
    </div>
  );
}
