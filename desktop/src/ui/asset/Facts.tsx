// "What you are getting" (artists on Live: "Before you publish"). The four facts, then the rig,
// the animations and the export when the add-on read them back (v8 step 17): label, mono value,
// delta or "same", a pass or fail dot on a check, and the fix under a failed row. v8 step 21: red
// only for what holds Publish; a lead accepts a failing check with one line of why, or takes it back.
import * as Menu from "@radix-ui/react-dropdown-menu";
import { useState } from "react";
import { MenuRoot, MenuTrigger } from "@/ui/menu/Menu";
import { factsWithDeltas, unrealRow, type FactRow } from "@/app/selectors";
import { useStore } from "@/app/store";
import type { Asset, CheckKey } from "@/data/types";
import { toast } from "@/ui/toast/toast";

const item: React.CSSProperties = { height: 36, display: "flex", alignItems: "center", padding: "0 10px", borderRadius: "var(--r-6)", cursor: "pointer", outline: "none", fontSize: 15, color: "var(--ink)" };

const quiet: React.CSSProperties = { alignSelf: "flex-start", border: 0, background: "transparent", padding: 0, font: "500 13px var(--sans)", color: "var(--ink60)", cursor: "pointer" };

/** A lead's accept on one failing row, or the accepted line with Take back. */
function Accept({ asset, row }: { asset: Asset; row: FactRow & { check: CheckKey } }) {
  const source = useStore((s) => s.source);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (what: () => Promise<void> | undefined) => {
    setBusy(true);
    try { await what(); setOpen(false); setReason(""); }
    catch (err) { toast(err instanceof Error ? err.message : "That did not go through.", "var(--bad)"); }
    finally { setBusy(false); }
  };
  if (row.accepted) return <button type="button" disabled={busy} onClick={() => void run(() => source?.takeBackCheck(asset.id, row.check))} style={quiet}>Take back</button>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} style={quiet}>Accept</button>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (reason.trim()) void run(() => source?.acceptCheck(asset.id, row.check, reason)); }} style={{ display: "flex", gap: 8 }}>
      <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Why, in one line" aria-label="Why this is accepted" style={{ flex: 1, minWidth: 0, height: 32, borderRadius: "var(--r-6)", border: 0, background: "var(--canvas)", padding: "0 10px", font: "400 13px var(--sans)", color: "var(--ink)", outline: "none" }} />
      <button type="submit" disabled={busy || !reason.trim()} style={{ height: 32, padding: "0 10px", borderRadius: "var(--r-6)", border: 0, background: reason.trim() ? "var(--amber)" : "var(--hover)", color: reason.trim() ? "var(--amber-fg)" : "var(--ink40)", font: "500 13px var(--sans)", cursor: reason.trim() ? "pointer" : "not-allowed" }}>Accept</button>
    </form>
  );
}

/** onSetBudget: leads get "Set a budget for this asset" in the block's menu. An override shows under Triangles.
 * canAccept: a lead accepts a failing check on the newest save, or takes an accept back. */
export function Facts({ asset, shown, artist, onSetBudget, canAccept }: { asset: Asset; shown: number | "live"; artist: boolean; onSetBudget?: () => void; canAccept?: boolean }) {
  const v = shown === "live" ? asset.versions[0] : asset.versions.find((x) => x.n === shown);
  if (!v) return null;
  const idx = asset.versions.indexOf(v);
  const previous = asset.versions[idx + 1];
  const unreal = unrealRow(v.unreal, !!v.note);
  const rows = [...factsWithDeltas(v.facts, previous?.facts, v.checks), ...(unreal ? [unreal] : [])];
  const against = previous?.facts ? `since v${previous.n}` : "first Version";
  const tone = { muted: "var(--ink40)", neutral: "var(--amber)", good: "var(--ok)" } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 6 }}>
        <span style={{ fontSize: 13, color: "var(--ink60)" }}>{artist && shown === "live" ? "Before you publish" : "What you are getting"} <span style={{ font: "400 11px var(--mono)", color: "var(--ink40)" }}>{against}</span></span>
        {onSetBudget ? (
          <MenuRoot>
            <MenuTrigger>
              <button type="button" className="nk-nav" aria-label="Facts menu" style={{ marginLeft: "auto", width: 32, height: 32, margin: "-4px 0 -4px auto", borderRadius: "var(--r-6)", border: 0, background: "transparent", color: "var(--ink40)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="8" r="1.4" /><circle cx="8" cy="8" r="1.4" /><circle cx="13" cy="8" r="1.4" /></svg>
              </button>
            </MenuTrigger>
            <Menu.Portal>
              <Menu.Content align="end" sideOffset={4} style={{ width: 240, background: "var(--raised)", borderRadius: "var(--r-12)", boxShadow: "var(--shadow-lift)", padding: 6, zIndex: 30, animation: "nk-rise var(--t-fast) var(--ease)" }}>
                <Menu.Item className="nk-menu-item" style={item} onSelect={onSetBudget}>Set a budget for this asset</Menu.Item>
              </Menu.Content>
            </Menu.Portal>
          </MenuRoot>
        ) : null}
      </div>
      {rows.length === 0 ? <span style={{ fontSize: 13, color: "var(--ink40)", padding: "10px 0", borderTop: "1px solid var(--line)" }}>Not checked yet.</span> : null}
      {rows.map((r) => (
        <div key={r.name} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "10px 0", borderTop: "1px solid var(--line)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "84px minmax(0, 1fr) auto 14px", gap: 12, alignItems: "baseline" }}>
            <span style={{ fontSize: 13, color: "var(--ink60)" }}>{r.name}</span>
            <span style={{ font: "400 13px var(--mono)", color: "var(--ink)" }}>{r.value}</span>
            <span style={{ font: "400 11px var(--mono)", color: tone[r.tone], whiteSpace: "nowrap" }}>{r.delta}</span>
            {r.info ? <span /> : r.pending
              ? <span aria-label="not checked yet" style={{ width: 8, height: 8, borderRadius: "50%", border: "1.5px solid var(--ink40)", boxSizing: "border-box", justifySelf: "end" }} />
              : <span aria-label={r.failed ? "fails" : r.soft ? (r.accepted ? "accepted" : r.soft === "warn" ? "warns" : "noted") : "passes"} style={{ width: 8, height: 8, borderRadius: "50%", background: r.failed ? "var(--bad)" : r.soft === "warn" && !r.accepted ? "var(--amber)" : r.soft ? "var(--ink40)" : "var(--ok)", justifySelf: "end" }} />}
          </div>
          {r.failed ? <span style={{ fontSize: 13, color: "var(--bad)", whiteSpace: "pre-line" }}>{r.fix}</span> : null}
          {r.soft && !r.accepted ? <span style={{ fontSize: 13, color: "var(--ink60)", whiteSpace: "pre-line" }}>{r.fix}</span> : null}
          {r.accepted ? <span style={{ fontSize: 13, color: "var(--ink60)" }}>Accepted by {r.accepted.by}: {r.accepted.reason}</span> : null}
          {canAccept && idx === 0 && r.check && (r.failed || r.soft) ? <Accept asset={asset} row={{ ...r, check: r.check }} /> : null}
          {r.name === "Triangles" && asset.budget ? <span style={{ font: "400 11px var(--mono)", color: "var(--ink40)" }}>Budget {asset.budget.toLocaleString("en-US")} for this asset.</span> : null}
        </div>
      ))}
    </div>
  );
}
