// ActivityRail. 360 wide, hairline left. Online faces, then the feed. Review filters the grid to
// Ready, oldest first; it is not rendered for a viewer (the parent decides with can()).
import { X } from "lucide-react";
import type { ActivityItem, Person } from "@/data/types";
import { t } from "@/copy/en";
import { stateColor } from "@/lib/state";
import { Button } from "./Button";
import { PersonAvatar } from "./PresenceAvatar";

export interface ActivityRailProps {
  feed: ActivityItem[];
  people: Person[];
  online: Person[];
  readyCount: number;
  showReview: boolean;
  onReview?: () => void;
  onClose: () => void;
  onOpen?: (item: ActivityItem) => void;
}

export function ActivityRail({ feed, people, online, readyCount, showReview, onReview, onClose, onOpen }: ActivityRailProps) {
  const by = (id: string) => people.find((p) => p.id === id);
  return (
    <aside aria-label="Activity" className="nk-panel-in flex w-90 shrink-0 flex-col overflow-hidden border-l border-hairline bg-canvas">
      <div className="flex items-center gap-3 px-6 pb-4 pt-6">
        <span className="flex-1 text-16 font-medium">Activity</span>
        {showReview ? <Button size="sm" variant="inverted" onClick={onReview}>Review<span className="role-mono opacity-70">{readyCount}</span></Button> : null}
        <button type="button" onClick={onClose} aria-label="Close activity" className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover"><X size={16} strokeWidth={1.75} /></button>
      </div>
      <div className="flex items-center gap-1.5 px-6 pb-4">
        {online.map((p) => <PersonAvatar key={p.id} person={p} size={28} ring="var(--bg-canvas)" className="-ml-1.5 first:ml-0" />)}
        <span className="ml-2 text-13 text-secondary">{online.length} online</span>
      </div>
      <div className="flex flex-1 flex-col gap-6 overflow-auto px-6 pb-8 pt-2">
        {feed.length === 0 ? <span className="text-13 text-secondary">{t("rail.empty")}</span> : null}
        {feed.map((f) => {
          const p = by(f.personId);
          return (
            <button type="button" key={f.id} onClick={() => onOpen?.(f)} className="flex gap-3 text-left outline-none focus-visible:shadow-focus rounded-md">
              {p ? <PersonAvatar person={p} size={28} /> : null}
              <div className="flex min-w-0 flex-col gap-0.75 leading-[1.45]">
                <span><span className="font-medium">{p?.name.split(" ")[0]}</span> <span className="text-body">{f.text}</span></span>
                <span className="inline-flex items-center gap-2 text-13 text-secondary"><span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: stateColor(f.dot) }} />{f.target}<span className="role-mono text-muted">{f.when}</span></span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
