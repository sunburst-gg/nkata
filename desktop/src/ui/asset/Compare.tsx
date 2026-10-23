// Compare: a wipe between the picked older Version and the current one, F flips, and the What
// changed rows under it. Kept from the current app and restyled to v8 (_stale/CHANGES.md,
// "Asset and Part"). Each side loads its own Version's model (modelOf). The mock has one model
// per asset, so there both sides show the same model and the rows carry the difference.
import { useEffect, useState } from "react";
import { modelOf, trisDelta } from "@/app/selectors";
import { useStore } from "@/app/store";
import type { Asset } from "@/data/types";
import { Stage } from "@/ui/stage/Stage";
import { NkViewer } from "@/viewer/NkViewer";
import { NoModel } from "@/ui/stage/NoModel";

export function Compare({ asset, projectColor }: { asset: Asset; projectColor: string }) {
  const compareWith = useStore((s) => s.compareWith);
  const [at, setAt] = useState(50);
  const [flipped, setFlipped] = useState(false);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "f" || e.key === "F") setFlipped((f) => !f); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  const current = asset.versions[0];
  const older = asset.versions.find((v) => v.n === compareWith);
  if (!current) return null;
  const left = flipped ? current : older;
  const right = flipped ? older : current;
  const sideOf = (v: typeof current | undefined) => { const m = v ? modelOf(asset, v.n) : {}; return { src: m.glb, poster: m.render, n: v?.n }; };
  const side = (x: ReturnType<typeof sideOf>) => (x.src ? <NkViewer src={x.src} poster={x.poster} autorotate={0.3} style={{ position: "absolute", inset: 0 }} /> : <NoModel still={x.poster} label={`v${x.n ?? ""} render`} line="No model in this save." />);
  const l = sideOf(left);
  const r = sideOf(right);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ position: "relative" }} onPointerMove={(e) => { if (e.buttons) setAt(Math.max(2, Math.min(98, ((e.clientX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.clientWidth) * 100))); }} onPointerDown={(e) => setAt(Math.max(2, Math.min(98, ((e.clientX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.clientWidth) * 100)))}>
        <Stage projectColor={projectColor} radius={16} aspect="16/10" shadow>
          {!older ? <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", font: "400 15px var(--sans)", color: "var(--ink40)" }}>Pick an older Version below to set it against v{current.n}.</span> : (
            <>
              <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${100 - at}% 0 0)` }}>{side(l)}</div>
              <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 0 0 ${at}%)` }}>{side(r)}</div>
              <div aria-hidden="true" style={{ position: "absolute", top: 0, bottom: 0, left: `${at}%`, width: 2, marginLeft: -1, background: "var(--raised)", boxShadow: "var(--shadow)" }} />
              <span role="slider" aria-label="Wipe" aria-valuenow={Math.round(at)} style={{ position: "absolute", top: "50%", left: `${at}%`, width: 32, height: 32, margin: "-16px 0 0 -16px", borderRadius: "50%", background: "var(--raised)", boxShadow: "var(--shadow-lift)", cursor: "ew-resize" }} />
              <span style={{ position: "absolute", left: 12, top: 12, font: "500 11px var(--mono)", color: "var(--ink)", background: "var(--raised)", padding: "2px 7px", borderRadius: "var(--r-6)" }}>v{left?.n}</span>
              <span style={{ position: "absolute", right: 12, top: 12, font: "500 11px var(--mono)", color: "var(--ink)", background: "var(--raised)", padding: "2px 7px", borderRadius: "var(--r-6)" }}>v{right?.n}{right === current ? " · current" : ""}</span>
              <span style={{ position: "absolute", left: 12, bottom: 12, font: "400 11px var(--mono)", color: "var(--ink40)" }}>Drag the handle · F to flip</span>
            </>
          )}
        </Stage>
      </div>
      {older ? <WhatChanged asset={asset} from={older.n} to={current.n} /> : null}
    </div>
  );
}

function WhatChanged({ asset, from, to }: { asset: Asset; from: number; to: number }) {
  const a = asset.versions.find((v) => v.n === from);
  const b = asset.versions.find((v) => v.n === to);
  if (!a || !b) return null;
  if (!a.facts || !b.facts) return <span style={{ fontSize: 13, color: "var(--ink40)" }}>v{from} was saved before Nkata kept a card. The renders tell the story.</span>;
  const same = a.facts.tris === b.facts.tris && a.facts.textures === b.facts.textures && a.facts.scale === b.facts.scale && a.facts.uvSets === b.facts.uvSets;
  if (same) return <span style={{ fontSize: 13, color: "var(--ink40)" }}>Nothing changed between v{from} and v{to}.</span>;
  const d = trisDelta(b.facts.tris, a.facts.tris);
  const rows: [string, string][] = [
    ["Triangles", `${a.facts.tris.toLocaleString("en-US")} to ${b.facts.tris.toLocaleString("en-US")} (${d.text})`],
    ["Textures", a.facts.textures === b.facts.textures ? `${b.facts.textures}, same` : `${a.facts.textures} to ${b.facts.textures}`],
    ["Scale", a.facts.scale === b.facts.scale ? `${b.facts.scale}, same` : `${a.facts.scale} to ${b.facts.scale}`],
    ["UV sets", a.facts.uvSets === b.facts.uvSets ? `${b.facts.uvSets}, same` : `${a.facts.uvSets} to ${b.facts.uvSets}`],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontSize: 13, color: "var(--ink60)", paddingBottom: 6 }}>What changed <span style={{ font: "400 11px var(--mono)", color: "var(--ink40)" }}>v{from} to v{to}</span></span>
      {rows.map(([name, value]) => (
        <div key={name} style={{ display: "grid", gridTemplateColumns: "84px minmax(0, 1fr)", gap: 12, padding: "10px 0", borderTop: "1px solid var(--line)" }}>
          <span style={{ fontSize: 13, color: "var(--ink60)" }}>{name}</span>
          <span style={{ font: "400 13px var(--mono)", color: "var(--ink)" }}>{value}</span>
        </div>
      ))}
    </div>
  );
}
