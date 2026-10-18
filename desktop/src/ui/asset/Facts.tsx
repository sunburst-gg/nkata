// "What you are getting" (artists on Live: "Before you publish"). Four rows: label, mono value,
// delta or "same", a pass or fail dot, and the fix under a failed row. Every fact appears once.
import { factsWithDeltas } from "@/app/selectors";
import type { Asset } from "@/data/types";

export function Facts({ asset, shown, artist }: { asset: Asset; shown: number | "live"; artist: boolean }) {
  const v = shown === "live" ? asset.versions[0] : asset.versions.find((x) => x.n === shown);
  if (!v) return null;
  const idx = asset.versions.indexOf(v);
  const previous = asset.versions[idx + 1];
  const rows = factsWithDeltas(v.facts, previous?.facts, v.checks);
  const against = previous?.facts ? `since v${previous.n}` : "first Version";
  const tone = { muted: "var(--ink40)", neutral: "var(--amber)", good: "var(--ok)" } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontSize: 13, color: "var(--ink60)", paddingBottom: 6 }}>{artist && shown === "live" ? "Before you publish" : "What you are getting"} <span style={{ font: "400 11px var(--mono)", color: "var(--ink40)" }}>{against}</span></span>
      {rows.length === 0 ? <span style={{ fontSize: 13, color: "var(--ink40)", padding: "10px 0", borderTop: "1px solid var(--line)" }}>Not checked yet.</span> : null}
      {rows.map((r) => (
        <div key={r.name} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "10px 0", borderTop: "1px solid var(--line)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "84px minmax(0, 1fr) auto 14px", gap: 12, alignItems: "baseline" }}>
            <span style={{ fontSize: 13, color: "var(--ink60)" }}>{r.name}</span>
            <span style={{ font: "400 13px var(--mono)", color: "var(--ink)" }}>{r.value}</span>
            <span style={{ font: "400 11px var(--mono)", color: tone[r.tone], whiteSpace: "nowrap" }}>{r.delta}</span>
            <span aria-label={r.failed ? "fails" : "passes"} style={{ width: 8, height: 8, borderRadius: "50%", background: r.failed ? "var(--bad)" : "var(--ok)", justifySelf: "end" }} />
          </div>
          {r.failed ? <span style={{ fontSize: 13, color: "var(--bad)" }}>{r.fix}</span> : null}
        </div>
      ))}
    </div>
  );
}
