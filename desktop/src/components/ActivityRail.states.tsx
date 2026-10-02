import { createMockSource } from "@/data/mock";
import { ActivityRail } from "./ActivityRail";

const db = createMockSource().snapshot();
const online = db.people.filter((p) => p.presence === "online" && p.role !== "viewer");

export function ActivityRailStates() {
  return (
    <div className="flex h-150 gap-6 overflow-hidden rounded-xl border border-hairline">
      <div className="flex-1 p-6 text-13 text-muted">artist · with Review</div>
      <ActivityRail feed={db.activity} people={db.people} online={online} readyCount={4} showReview onClose={() => undefined} />
      <ActivityRail feed={db.activity} people={db.people} online={online} readyCount={4} showReview={false} onClose={() => undefined} />
    </div>
  );
}
