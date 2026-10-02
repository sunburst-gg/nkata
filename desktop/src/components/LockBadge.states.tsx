import { createMockSource } from "@/data/mock";
import { LockBadge } from "./LockBadge";

const people = createMockSource().snapshot().people;
const ada = people[0]!;
const chidi = people[1]!;

export function LockBadgeStates() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <LockBadge kind="you" holder={ada} />
        <LockBadge kind="other" holder={chidi} since="12 min" />
        <LockBadge kind="other" holder={chidi} since="12 min" onAsk={() => undefined} />
        <LockBadge kind="other" holder={chidi} since="12 min" asked />
        <LockBadge kind="approved" />
      </div>
      <span className="role-mono text-muted">you · other · request unlock · asked · approved lock</span>
    </div>
  );
}
