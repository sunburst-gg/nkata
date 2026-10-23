// Environment card: the render full-bleed with hard edges, an "Environment" tag, and a slow
// sideways drift on hover (background-position only, no transform, no mask).
import type { Asset } from "@/data/types";
import { NoModel } from "@/ui/stage/NoModel";
import { CardMeta } from "./CardMeta";
import { CornerPill, type Corner } from "./CornerPill";

export function EnvironmentCard({ asset, corner, pulse, onOpen }: { asset: Asset; corner: Corner; pulse?: boolean; onOpen: () => void }) {
  return (
    <div className="nk-card" role="link" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }} style={{ display: "flex", flexDirection: "column", gap: 12, cursor: "pointer", outline: "none" }}>
      <div style={{ aspectRatio: "4/3", borderRadius: "var(--r-12)", overflow: "hidden", position: "relative", background: "linear-gradient(180deg, var(--stage-top), var(--stage-bot))", boxShadow: "var(--shadow)", animation: pulse ? "nk-pulse-once 1.1s ease-out" : undefined }}>
        <div className="nk-env-drift" role="img" aria-label={`${asset.name} render`} style={{ position: "absolute", inset: 0, backgroundImage: asset.render ? `url(${asset.render})` : "none", backgroundSize: "112% auto", backgroundPosition: "30% center" }} />
        {asset.render ? null : <NoModel label={`${asset.name} render`} line={asset.versions.length ? undefined : "No save yet"} />}
        <span style={{ position: "absolute", right: 12, bottom: 12, font: "400 var(--t-11) var(--mono)", color: "var(--scrim-fg)", background: "var(--scrim)", padding: "2px 7px", borderRadius: "var(--r-6)" }}>Environment</span>
        <CornerPill kind={corner} />
      </div>
      <CardMeta asset={asset} />
    </div>
  );
}
