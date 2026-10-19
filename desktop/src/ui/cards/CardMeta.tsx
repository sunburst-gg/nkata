// Under a card, no border: the name (15, medium), the note in serif 15 only when a person wrote
// one, then the avatar and "Ada · 2 min ago" in mono 11, and "2 of 3 pins open" at the right
// while a sent back Version has pins to address (v8 step 14).
import { openPinsLine } from "@/app/selectors";
import type { Asset } from "@/data/types";

export function CardMeta({ asset }: { asset: Asset }) {
  const note = asset.versions[0]?.note ?? "";
  const pins = openPinsLine(asset);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 2px" }}>
      <span style={{ fontSize: 15, fontWeight: 500, color: "var(--ink)" }}>{asset.name}</span>
      {note ? <span style={{ font: "400 15px/1.4 var(--serif)", color: "var(--ink)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{note}</span> : null}
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 2 }}>
        <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: "50%", background: asset.owner.color, color: "var(--on-color)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 600 }}>{asset.owner.initial}</span>
        <span style={{ font: "400 var(--t-11) var(--mono)", color: "var(--ink60)" }}>{asset.owner.first} · {asset.changedAt}</span>
        {pins ? <span style={{ font: "400 var(--t-11) var(--mono)", color: "var(--bad)", marginLeft: "auto" }}>{pins}</span> : null}
      </div>
    </div>
  );
}
