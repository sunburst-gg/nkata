// PartThumb. 4:3 thumbnail with an 8 px state dot top left and the owner's face bottom right.
// A waiting part is dimmed and names its gate in mono. The active part has an accent border.
import type { Part, Person } from "@/data/types";
import { cn } from "@/lib/cn";
import { renderStyle } from "@/lib/renders";
import { STATE_WORD } from "@/lib/state";
import { PersonAvatar } from "./PresenceAvatar";
import { StateDot } from "./StateBadge";

export interface PartThumbProps {
  part: Part;
  owner: Person;
  active?: boolean;
  label?: string;
  onOpen?: () => void;
  className?: string;
}

export function PartThumb({ part, owner, active, label, onOpen, className }: PartThumbProps) {
  const waiting = part.state === "waiting";
  const version = part.versions[0];
  return (
    <button type="button" onClick={onOpen} className={cn("flex min-w-0 flex-1 flex-col gap-2.5 text-left outline-none focus-visible:shadow-focus rounded-lg", waiting && "opacity-60", className)} style={{ maxWidth: 200 }}>
      <div className={cn("relative aspect-[4/3] overflow-hidden rounded-lg border bg-panel transition-colors duration-150", active ? "border-accent" : "border-hairline")}>
        {part.render ? <div aria-hidden="true" className="absolute inset-0" style={renderStyle(part.render, "tile")} /> : null}
        {waiting ? <div className="role-mono absolute inset-0 flex items-center justify-center p-3 text-center text-muted">{part.gate.length ? `after ${part.gate.join(", ")}` : "gate removed"}</div> : null}
        <StateDot state={part.state} className="absolute left-2 top-2 shadow-[0_0_0_2px_var(--scrim)]" />
        <span className="absolute bottom-2 right-2 flex"><PersonAvatar person={owner} size={22} ring="var(--scrim-strong)" /></span>
      </div>
      <div className="flex items-baseline gap-2 px-0.5">
        <span className="text-14 font-medium text-heading">{part.name}</span>
        {version ? <span className="role-mono text-muted">v{version.n}</span> : null}
        <span className="ml-auto text-12 text-secondary">{label ?? STATE_WORD[part.state]}</span>
      </div>
    </button>
  );
}
