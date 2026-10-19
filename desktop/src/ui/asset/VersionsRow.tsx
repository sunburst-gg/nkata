// Versions, newest first, Live first when present. The selected card is ringed, the others sit at
// 55%. The Compare toggle sits at the right end of the header.
import { modelOf } from "@/app/selectors";
import { useStore } from "@/app/store";
import type { Asset } from "@/data/types";
import { NkViewer } from "@/viewer/NkViewer";
import { stageGradient } from "@/ui/stage/Stage";

export interface Stop { key: number | "live"; title: string; when: string; note: string; hasNote: boolean; approved: boolean; glb?: string; render?: string }

/** The stops in the row, each with the model and still its card shows (modelOf). */
export function stopsOf(asset: Asset): Stop[] {
  const stops: Stop[] = asset.versions.map((v) => ({ key: v.n, title: `v${v.n}`, when: v.publishedAt, note: v.note || "Saved, not published yet.", hasNote: !!v.note, approved: v.approved, ...modelOf(asset, v.n) }));
  if (asset.live) stops.unshift({ key: "live", title: "Live", when: "just now", note: "Latest save. Not handed off yet.", hasNote: false, approved: false, ...modelOf(asset, "live") });
  return stops;
}

export function VersionsRow({ asset, projectColor, shown }: { asset: Asset; projectColor: string; shown: number | "live" }) {
  const setStop = useStore((s) => s.setStop);
  const compare = useStore((s) => s.compare);
  const { top, bot } = stageGradient(projectColor);
  const stops = stopsOf(asset);
  const canCompare = asset.versions.length > 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "var(--ink60)" }}>Versions</span>
        <span style={{ flex: 1 }} />
        {canCompare ? <button type="button" aria-pressed={compare} onClick={() => useStore.setState({ compare: !compare, compareWith: !compare ? (asset.versions[1]?.n ?? null) : null })} style={{ height: 28, padding: "0 10px", borderRadius: "var(--r-6)", border: compare ? "1.5px solid var(--amber)" : "1.5px solid var(--line)", background: compare ? "var(--raised)" : "transparent", color: "var(--ink)", font: "500 13px var(--sans)", cursor: "pointer" }}>Compare</button> : null}
      </div>
      <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 4 }}>
        {stops.map((st) => {
          const sel = st.key === shown;
          return (
            <button type="button" key={String(st.key)} aria-pressed={sel} onClick={() => setStop(st.key)} className="nk-stop" style={{ flex: "0 0 180px", display: "flex", flexDirection: "column", gap: 8, cursor: "pointer", opacity: sel ? 1 : .55, transition: "opacity var(--t-fast)", border: 0, background: "transparent", padding: 0, textAlign: "left", font: "inherit" }}>
              <div style={{ aspectRatio: "4/3", borderRadius: "var(--r-12)", position: "relative", background: `linear-gradient(180deg, ${top}, ${bot})`, boxShadow: sel ? "0 0 0 2px var(--ink), var(--shadow)" : "var(--shadow)", overflow: "hidden", width: "100%" }}>
                {asset.kind === "environment"
                  ? <div role="img" aria-label={`${st.title} render`} style={{ position: "absolute", inset: 0, backgroundImage: `url(${st.render ?? ""})`, backgroundSize: "cover", backgroundPosition: "center" }} />
                  : <><div aria-hidden="true" style={{ position: "absolute", left: "22%", right: "22%", bottom: "10%", height: "8%", borderRadius: "50%", background: "radial-gradient(ellipse at center, var(--contact), transparent 70%)" }} /><NkViewer src={st.glb} hoverRotate style={{ position: "absolute", inset: 0, pointerEvents: "none" }} /></>}
                {st.key === "live" ? <span style={{ position: "absolute", left: 8, top: 8, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--ink)", background: "var(--raised)", padding: "2px 7px 2px 6px", borderRadius: "var(--r-6)" }}><span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: asset.owner.color, animation: "nk-breathe 2.4s var(--ease) infinite" }} />Live</span> : null}
                {st.approved ? <span aria-label="Approved" style={{ position: "absolute", right: 8, top: 8, width: 20, height: 20, borderRadius: "50%", background: "var(--amber)", color: "var(--amber-fg)", display: "inline-flex", alignItems: "center", justifyContent: "center", transform: "rotate(-6deg)" }}><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" /></svg></span> : null}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}><span style={{ font: "500 11px var(--mono)", color: "var(--ink)" }}>{st.title}</span><span style={{ font: "400 11px var(--mono)", color: "var(--ink40)" }}>{st.when}</span></div>
              <span style={{ font: "400 15px/1.35 var(--serif)", color: st.hasNote ? "var(--ink)" : "var(--ink40)", fontStyle: st.hasNote ? "normal" : "italic", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{st.note}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
