// VersionThumb. 4:3, 2 px border: heading for current, accent for the picked one. Version in mono.
import type { Version } from "@/data/types";
import { cn } from "@/lib/cn";
import { renderStyle } from "@/lib/renders";

export interface VersionThumbProps {
  version: Version;
  current?: boolean;
  picked?: boolean;
  dim?: boolean;
  onPick?: () => void;
}

export function VersionThumb({ version, current, picked, dim, onPick }: VersionThumbProps) {
  return (
    <button type="button" onClick={onPick} aria-pressed={picked} className={cn("flex w-full flex-col gap-1.5 text-left outline-none focus-visible:shadow-focus rounded-md", dim && "opacity-60")}>
      <div className={cn("relative aspect-[4/3] w-full overflow-hidden rounded-md border-2 bg-panel transition-colors duration-150", picked ? "border-accent" : current ? "border-heading" : "border-transparent")}>
        {version.render ? <div aria-hidden="true" className="absolute inset-0" style={renderStyle(version.render, "tile")} /> : <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center font-mono text-12 text-muted">v{version.n}</div>}
      </div>
      <div className="flex items-baseline gap-1.5 px-0.5">
        <span className={cn("font-mono text-12 font-medium", current || picked ? "text-heading" : "text-secondary")}>v{version.n}</span>
        <span className="min-w-0 truncate text-12 text-muted">{version.from ? `from v${version.from}` : version.note}</span>
      </div>
    </button>
  );
}
