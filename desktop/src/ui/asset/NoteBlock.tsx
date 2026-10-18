// The note in serif 24, or the Live line. System text is sans, ink at 40%, not italic
// (Decisions 10); serif and italics are only for words a person wrote.
import type { Asset } from "@/data/types";

export function NoteBlock({ asset, shown }: { asset: Asset; shown: number | "live" }) {
  if (shown === "live") return <span style={{ font: "400 15px/1.5 var(--sans)", color: "var(--ink40)", textWrap: "pretty" }}>{asset.owner.first} is still working on this. No note until Publish.</span>;
  const v = asset.versions.find((x) => x.n === shown);
  if (!v?.note) return <span style={{ font: "400 15px/1.5 var(--sans)", color: "var(--ink40)" }}>Saved, not published yet.</span>;
  return <span style={{ font: "400 var(--t-28)/1.35 var(--serif)", fontSize: 24, color: "var(--ink)", textWrap: "pretty" }}>{v.note}</span>;
}
