// Publish: the four checks as sentences, a failed one with its fix and the Fix action, the note
// (required, one line), Details for engineers collapsed, the card preview with deltas, and the
// Publish button with the prototype's labels. Only artists see this dialog.
import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { factsWithDeltas, publishState } from "@/app/selectors";
import { useStore } from "@/app/store";
import type { Asset } from "@/data/types";
import { toast } from "@/ui/toast/toast";

export function PublishDialog({ asset, open, onOpenChange }: { asset: Asset; open: boolean; onOpenChange: (open: boolean) => void }) {
  const source = useStore((s) => s.source);
  const me = useStore((s) => s.me);
  const [note, setNote] = useState("");
  const [details, setDetails] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const v = asset.versions[0];
  const checks = v?.checks ?? [];
  const state = publishState(asset, note);
  const rows = factsWithDeltas(v?.facts, asset.versions[1]?.facts, checks);
  const tone = { muted: "var(--ink40)", neutral: "var(--amber)", good: "var(--ok)" } as const;
  const fix = async (key: (typeof checks)[number]["key"]) => { await source?.fixCheck(asset.id, key); };
  const publish = async () => {
    if (!state.can || !source || !me || !v) return;
    setBusy(true);
    try {
      await source.publish(asset.id, note.trim(), details.trim() || undefined);
      onOpenChange(false);
      setNote(""); setDetails("");
      useStore.setState({ stop: null });
      toast(`Published v${v.n + 1}. Emeka can see it now.`, me.color, { thumb: asset.render });
    } catch (err) { toast(err instanceof Error ? err.message : "Publish did not go through.", "var(--bad)"); }
    finally { setBusy(false); }
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 40, animation: "nk-fadein var(--t-fast) var(--ease)" }} />
        <Dialog.Content aria-describedby={undefined} style={{ position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: 520, background: "var(--raised)", borderRadius: "var(--r-16)", boxShadow: "var(--shadow-lift)", padding: 28, display: "flex", flexDirection: "column", gap: 20, zIndex: 41, animation: "nk-rise var(--t-panel) var(--ease)", outline: "none" }}>
          <Dialog.Title style={{ margin: 0, font: "400 var(--t-28) var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)" }}>Publish {asset.name}</Dialog.Title>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {checks.map((c) => (
              <div key={c.key} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span aria-label={c.pass ? "passes" : "fails"} style={{ marginTop: 6, width: 8, height: 8, borderRadius: "50%", background: c.pass ? "var(--ok)" : "var(--bad)", flexShrink: 0 }} />
                <span style={{ flex: 1, color: "var(--ink80)" }}>{c.sentence}{!c.pass ? <span style={{ display: "block", fontSize: 13, color: "var(--bad)" }}>{c.fix}</span> : null}</span>
                {!c.pass ? <button type="button" onClick={() => void fix(c.key)} style={{ height: 28, padding: "0 10px", borderRadius: "var(--r-6)", border: 0, background: "var(--canvas)", color: "var(--ink)", font: "500 13px var(--sans)", cursor: "pointer" }}>Fix</button> : null}
              </div>
            ))}
          </div>
          <textarea autoFocus value={note} onChange={(e) => setNote(e.target.value.replace(/\n/g, " "))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void publish(); } }} placeholder="What did you do, what will they get" rows={2} aria-label="Note" style={{ resize: "none", borderRadius: "var(--r-6)", border: 0, background: "var(--canvas)", padding: 12, font: "400 20px/1.4 var(--serif)", color: "var(--ink)", outline: "none" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(!detailsOpen)} style={{ alignSelf: "flex-start", border: 0, background: "transparent", padding: 0, font: "400 13px var(--sans)", color: "var(--ink60)", cursor: "pointer" }}>{detailsOpen ? "Details for engineers" : "Details for engineers, optional"}</button>
            {detailsOpen ? <textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Anything an engineer needs to know" rows={3} aria-label="Details for engineers" style={{ resize: "none", borderRadius: "var(--r-6)", border: 0, background: "var(--canvas)", padding: 12, font: "400 15px/1.4 var(--sans)", color: "var(--ink)", outline: "none" }} /> : null}
          </div>
          {rows.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
              {rows.map((r) => (
                <div key={r.name} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 11, color: "var(--ink60)" }}>{r.name}</span>
                  <span style={{ font: "400 13px var(--mono)", color: "var(--ink)" }}>{r.value}</span>
                  <span style={{ font: "400 11px var(--mono)", color: tone[r.tone] }}>{r.delta}</span>
                </div>
              ))}
            </div>
          ) : null}
          <button type="button" onClick={() => void publish()} aria-disabled={!state.can} style={{ height: 44, borderRadius: "var(--r-6)", border: 0, background: state.can ? "var(--amber)" : "var(--hover)", color: state.can ? "var(--amber-fg)" : "var(--ink40)", font: "500 15px var(--sans)", cursor: state.can && !busy ? "pointer" : "not-allowed" }}>{state.label}</button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
