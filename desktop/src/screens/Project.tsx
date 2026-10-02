// Project. The whole game as asset tiles. Tabs by kind, sort by last changed. Review is a filter.
import { ChevronDown } from "lucide-react";
import type { AssetKind } from "@/data/types";
import { t } from "@/copy/en";
import { useStore } from "@/store";
import { AssetTile } from "@/components/AssetTile";
import { Tabs } from "@/components/Tabs";
import { useGo, usePeople, useProject } from "@/lib/hooks";

const TABS: ("All" | AssetKind)[] = ["All", "Characters", "Levels", "Props", "Scripts", "Sound"];

export function Project() {
  const project = useProject();
  const assets = useStore((s) => s.db.assets);
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const review = useStore((s) => s.reviewMode);
  const setReview = useStore((s) => s.setReview);
  const { by } = usePeople();
  const go = useGo();
  const shown = assets
    .filter((a) => (tab === "All" || a.kind === tab) && (!review || a.parts.some((p) => p.state === "ready")))
    .sort((a, b) => (review ? b.changedOrder - a.changedOrder : a.changedOrder - b.changedOrder));
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-8">
        <Tabs aria-label="Asset kinds" items={TABS.map((v) => ({ value: v, label: v }))} value={tab} onChange={setTab} />
        <span className="ml-auto inline-flex items-center gap-1.5 text-13 text-secondary">Last changed<ChevronDown size={10} strokeWidth={2} aria-hidden="true" /></span>
      </div>
      {review ? (
        <div className="flex items-baseline gap-4"><span className="role-asset-title">Ready for review</span><span className="text-secondary">Oldest first.</span><button type="button" onClick={() => setReview(false)} className="ml-auto text-13 text-secondary hover:text-heading">Show all</button></div>
      ) : null}
      {shown.length === 0 ? <span className="text-secondary">{review ? t("review.empty") : t("project.empty")}</span> : null}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-x-6 gap-y-8">
        {shown.map((a) => <AssetTile key={a.id} asset={a} people={a.present.map(by)} owner={by(a.ownerId)} onOpen={() => go.asset(a.slug, project.slug)} />)}
      </div>
    </div>
  );
}
