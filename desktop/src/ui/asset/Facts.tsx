// "What you are getting" (artists on Live: "Before you publish"). Four rows: label, mono value,
// delta or "same", a pass or fail dot, and the fix under a failed row. Every fact appears once.
import * as Menu from "@radix-ui/react-dropdown-menu";
import { MenuRoot, MenuTrigger } from "@/ui/menu/Menu";
import { factsWithDeltas } from "@/app/selectors";
import type { Asset } from "@/data/types";

const item: React.CSSProperties = { height: 36, display: "flex", alignItems: "center", padding: "0 10px", borderRadius: "var(--r-6)", cursor: "pointer", outline: "none", fontSize: 15, color: "var(--ink)" };

/** onSetBudget: leads get "Set a budget for this asset" in the block's menu. An override shows under Triangles. */
export function Facts({ asset, shown, artist, onSetBudget }: { asset: Asset; shown: number | "live"; artist: boolean; onSetBudget?: () => void }) {
  const v = shown === "live" ? asset.versions[0] : asset.versions.find((x) => x.n === shown);
  if (!v) return null;
  const idx = asset.versions.indexOf(v);
  const previous = asset.versions[idx + 1];
  const rows = factsWithDeltas(v.facts, previous?.facts, v.checks);
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
            {r.pending
              ? <span aria-label="not checked yet" style={{ width: 8, height: 8, borderRadius: "50%", border: "1.5px solid var(--ink40)", boxSizing: "border-box", justifySelf: "end" }} />
              : <span aria-label={r.failed ? "fails" : "passes"} style={{ width: 8, height: 8, borderRadius: "50%", background: r.failed ? "var(--bad)" : "var(--ok)", justifySelf: "end" }} />}
          </div>
          {r.failed ? <span style={{ fontSize: 13, color: "var(--bad)" }}>{r.fix}</span> : null}
          {r.name === "Triangles" && asset.budget ? <span style={{ font: "400 11px var(--mono)", color: "var(--ink40)" }}>Budget {asset.budget.toLocaleString("en-US")} for this asset.</span> : null}
        </div>
      ))}
    </div>
  );
}
