// The activity rail: Today, a Review button with the count of Ready assets, and the feed. 320 wide.
import { X } from "lucide-react";
import type { ActivityItem, Person } from "@/data/types";
import { firstName } from "@/lib/hooks";
import { Button } from "./Button";
import { PresenceAvatar } from "./PresenceAvatar";

export interface ActivityRailProps {
  feed: ActivityItem[];
  by: (id: string) => Person;
  readyCount: number;
  showReview: boolean;
  onReview: () => void;
  onClose: () => void;
  /** A row opens its part: "published v3" opens it comparing v2 with v3. */
  onOpen: (item: ActivityItem) => void;
}

export function ActivityRail({ feed, by, readyCount, showReview, onReview, onClose, onOpen }: ActivityRailProps) {
  return (
    <aside id="activity" aria-label="Today" className="flex w-80 shrink-0 flex-col overflow-auto border-l border-hairline p-6 nk-panel-in">
      <div className="mb-5 flex items-center gap-3">
        <span className="role-moment-sm text-heading">Today</span>
        {showReview ? <Button size="sm" variant="outline" className="ml-auto h-7.5" onClick={onReview}>Review<span className="role-mono text-secondary">{readyCount}</span></Button> : <span className="ml-auto" />}
        <button type="button" aria-label="Close" onClick={onClose} className="flex size-6 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-muted hover:text-heading"><X size={16} strokeWidth={1.5} /></button>
      </div>
      {feed.length === 0 ? <span className="text-13 text-secondary">Nothing has changed today.</span> : null}
      <div className="flex flex-col gap-2">
        {feed.map((e) => {
          const p = by(e.personId);
          const Row = e.assetSlug ? "button" : "div";
          return (
            <Row key={e.id} type={e.assetSlug ? "button" : undefined} onClick={e.assetSlug ? () => onOpen(e) : undefined} className={`-mx-2 flex gap-2.5 rounded-lg border-0 bg-transparent px-2 py-1 text-left ${e.assetSlug ? "cursor-pointer hover:bg-hover" : ""}`}>
              <PresenceAvatar initial={p.initial} tone={p.tone} name={p.name} size={26} />
              <div className="flex flex-col gap-0.5 text-13 leading-[1.45]">
                <span className="text-body"><span className="font-medium text-heading">{firstName(p.name)}</span> {e.text}</span>
                <span className="text-muted">{e.when}</span>
              </div>
            </Row>
          );
        })}
      </div>
    </aside>
  );
}
