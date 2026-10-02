// LockBadge. h 28 pill on bg-raised. you · other · request unlock · approved lock.
// Copy: lock.you, lock.other, lock.ask, lock.asked.
import type { Person } from "@/data/types";
import { t } from "@/copy/en";
import { cn } from "@/lib/cn";
import { PersonAvatar } from "./PresenceAvatar";
import { StateDot } from "./StateBadge";

export type LockBadgeProps =
  | { kind: "you"; holder: Person; className?: string }
  | { kind: "other"; holder: Person; since: string; className?: string; onAsk?: () => void; asked?: boolean }
  | { kind: "approved"; className?: string };

export function LockBadge(props: LockBadgeProps) {
  const base = "inline-flex h-7 items-center gap-2 rounded-full bg-raised text-13 text-body";
  if (props.kind === "approved") {
    return <span className={cn(base, "px-2.5", props.className)}><StateDot state="approved" />Approved. Locked.</span>;
  }
  if (props.kind === "you") {
    return <span className={cn(base, "pl-1.5 pr-2.5", props.className)}><PersonAvatar person={props.holder} size={18} />{t("lock.you")}</span>;
  }
  return (
    <span className={cn(base, "pl-1.5", props.onAsk ? "pr-1.5" : "pr-2.5", props.className)}>
      <PersonAvatar person={props.holder} size={18} />
      {props.holder.name.split(" ")[0]} has this part
      {props.asked ? <span className="role-mono text-muted">{t("lock.asked")}</span> : props.onAsk ? (
        <button type="button" onClick={props.onAsk} className="h-5.5 rounded-full bg-heading px-2 text-12 font-medium text-canvas">{t("lock.ask")}</button>
      ) : <span className="role-mono text-muted">{props.since}</span>}
    </span>
  );
}
