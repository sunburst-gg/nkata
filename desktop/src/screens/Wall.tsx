// The wall: serif title with the team strip beside it, the filter chips, sections per group with
// a hairline, and the cards. Empty states and the slim bar come in step 7.
import { useStore } from "@/app/store";
import { applyFilter, cardOrder, isApproved, needsMe, sectionsByGroup } from "@/app/selectors";
import type { Asset } from "@/data/types";
import { EnvironmentCard } from "@/ui/cards/EnvironmentCard";
import { ObjectCard } from "@/ui/cards/ObjectCard";
import type { Corner } from "@/ui/cards/CornerPill";
import { FilterChips } from "@/ui/wall/FilterChips";
import { LeadEmpty } from "@/ui/wall/LeadEmpty";
import { StageEmpty } from "@/ui/wall/StageEmpty";
import { YourTurnBar } from "@/ui/wall/YourTurnBar";
import { TeamStrip } from "@/ui/people/TeamStrip";
import { FirstTimeNote } from "@/ui/notes/FirstTimeNote";
import { isLead } from "@/auth/permissions";

export function Wall() {
  const project = useStore((s) => s.projects.find((p) => p.id === s.projectId) ?? null);
  const assets = useStore((s) => s.assets);
  const me = useStore((s) => s.me);
  const filter = useStore((s) => s.filter);
  const group = useStore((s) => s.group);
  const saved = useStore((s) => s.saved);
  const pulse = useStore((s) => s.pulse);
  const firstSaveFilled = useStore((s) => s.firstSaveFilled);
  const stage = useStore((s) => s.stage);
  const go = useStore((s) => s.go);
  if (!project || !me) return null;
  const lead = isLead(me.role);
  const leadEmpty = lead && assets.length === 0;
  // The artist's first save keeps the Stage full size for the visit; so does an empty wall.
  const stageEmpty = !lead && (assets.length === 0 || (firstSaveFilled && stage !== "studio" && me.role === "artist"));
  const yourTurn = me.role === "artist" && stage === "joining" && !assets.some((a) => a.owner.id === me.id);
  const firstLive = assets.find((a) => a.live);
  const mine = needsMe(assets, me);
  const shown = applyFilter(cardOrder(assets, saved), me, filter, group);
  const sections = sectionsByGroup(assets, shown);
  const cornerOf = (a: Asset): Corner => (a.live ? "live" : isApproved(a) ? "approved" : mine.includes(a) ? "needsMe" : null);
  return (
    <div data-nk-wall="1" style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 32 }}>
        <h1 style={{ margin: 0, font: "400 var(--t-40)/1.1 var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)" }}>{project.name}</h1>
        <TeamStrip />
      </div>
      {leadEmpty ? <LeadEmpty /> : null}
      {stageEmpty ? <StageEmpty /> : null}
      {yourTurn ? <YourTurnBar /> : null}
      {assets.length > 0 && !stageEmpty ? (
        <>
          <FilterChips />
          {sections.map((sec) => (
            <div key={sec.name} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {sec.titled ? (
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, paddingBottom: 10, borderBottom: "1px solid var(--line)" }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{sec.name}</span>
                  <span style={{ font: "400 var(--t-11) var(--mono)", color: "var(--ink40)", whiteSpace: "nowrap", flexShrink: 0 }}>· {sec.assets.length}</span>
                </div>
              ) : null}
              <div className="nk-wall-grid">
                {sec.assets.map((a) => a.kind === "environment"
                  ? <EnvironmentCard key={a.id} asset={a} corner={cornerOf(a)} pulse={pulse === a.id} onOpen={() => go("asset", { assetId: a.id })} />
                  : <ObjectCard key={a.id} asset={a} projectColor={project.color} corner={cornerOf(a)} pulse={pulse === a.id} fill={firstSaveFilled && a.changedAt === "Just now" && !pulse} onOpen={() => go("asset", { assetId: a.id })} note={a.live && a === firstLive && stage !== "studio" ? <FirstTimeNote idea="live" text={`Live means ${a.owner.first}'s latest save. Not handed off yet. You can still comment.`} style={{ left: 12, top: 46 }} /> : null} />)}
              </div>
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}
