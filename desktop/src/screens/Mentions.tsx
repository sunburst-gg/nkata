// Mentions: rows with the render on the lit stage, the pin spot in the person's color, who did
// what on which model, when, and the text in serif. Click opens the asset. Nothing waiting
// says so in one serif line. Markup from the prototype's MENTIONS block.
import { useStore } from "@/app/store";
import type { Mention } from "@/data/types";

export function MentionsScreen() {
  const mentions = useStore((s) => s.mentions);
  const go = useStore((s) => s.go);
  const open = (m: Mention) => go("asset", { assetId: m.asset.id });
  return (
    <div style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 28 }}>
      <h1 style={{ margin: 0, font: "400 var(--t-40)/1.1 var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)" }}>Mentions</h1>
      {mentions.length === 0 ? <span style={{ font: "400 20px var(--serif)", color: "var(--ink60)" }}>Nothing is waiting on you.</span> : null}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {mentions.map((m) => (
          <button key={m.id} type="button" onClick={() => open(m)} aria-label={`${m.who.name} ${m.verb} ${m.asset.name}`} style={{ display: "grid", gridTemplateColumns: "120px minmax(0, 1fr)", gap: 20, padding: "16px 0", borderTop: "1px solid var(--line)", cursor: "pointer", border: 0, borderTopStyle: "solid", background: "transparent", textAlign: "left", font: "inherit" }}>
            <div style={{ aspectRatio: "4 / 3", borderRadius: "var(--r-12)", position: "relative", background: "linear-gradient(180deg, var(--stage-top), var(--stage-bot))", overflow: "hidden" }}>
              {m.asset.render ? <img src={m.asset.render} alt="" style={{ position: "absolute", inset: "10% 12% 8%", width: "76%", height: "82%", objectFit: "contain", objectPosition: "center bottom" }} /> : null}
              <span aria-hidden="true" style={{ position: "absolute", left: m.px, top: m.py, width: 14, height: 14, margin: "-7px 0 0 -7px", borderRadius: "50%", background: m.who.color, boxShadow: "0 0 0 2px var(--raised), 0 2px 6px var(--contact)" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink60)" }}>
                <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: "50%", background: m.who.color, color: "var(--on-color)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 600 }}>{m.who.initial}</span>
                <span style={{ color: "var(--ink)", fontWeight: 500 }}>{m.who.first}</span>
                {m.verb}
                <span style={{ color: "var(--ink)" }}>{m.asset.name}</span>
                <span style={{ marginLeft: "auto", font: "400 var(--t-11) var(--mono)" }}>{m.when}</span>
              </div>
              <span style={{ font: "400 20px/1.35 var(--serif)", color: "var(--ink)" }}>{m.text}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
