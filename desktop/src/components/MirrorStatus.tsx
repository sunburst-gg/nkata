// MirrorStatus. compact 24, large 44 readable across the room. Time in mono. One line on failure.
// Copy: mirror.synced, mirror.syncing, mirror.failed.closed, mirror.offline.
import type { MirrorState } from "@/data/types";
import { t } from "@/copy/en";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

export interface MirrorStatusProps {
  state: MirrorState;
  seconds?: number;
  reason?: string;
  size?: "compact" | "large";
  onRetry?: () => void;
  className?: string;
}

function Dot({ state, size }: { state: MirrorState; size: number }) {
  if (state === "offline") return <span aria-hidden="true" className="shrink-0 rounded-full border-[1.5px] border-muted" style={{ width: size, height: size }} />;
  const color = state === "synced" ? "var(--state-synced)" : state === "syncing" ? "var(--state-syncing)" : "var(--state-sync-failed)";
  return <span aria-hidden="true" className={cn("shrink-0 rounded-full transition-colors duration-150", state === "syncing" && "nk-pulse")} style={{ width: size, height: size, background: color }} />;
}

export function MirrorStatus({ state, seconds = 4, reason, size = "compact", onRetry, className }: MirrorStatusProps) {
  const failedLine = reason ? t("mirror.failed.import", { reason }) : t("mirror.failed.closed");
  if (size === "compact") {
    return (
      <span className={cn("inline-flex h-6 items-center gap-2 text-13 text-body", className)}>
        <Dot state={state} size={8} />
        {state === "synced" ? <>In Unreal<span className="role-mono text-muted">{seconds} s</span></> : null}
        {state === "syncing" ? <>Syncing to Unreal<span className="role-mono text-muted">{seconds} s</span></> : null}
        {state === "failed" ? <>Not in Unreal<span className="text-muted">· {(reason ?? "the editor is closed").replace(/\.$/, "")}</span></> : null}
        {state === "offline" ? <span className="text-secondary">Offline. Saves are kept.</span> : null}
      </span>
    );
  }
  return (
    <div className={cn("flex h-11 items-center gap-3 rounded-lg border bg-panel px-3.5", state === "failed" ? "border-state-sync-failed" : "border-hairline", className)}>
      <Dot state={state} size={12} />
      {state === "synced" ? <><span className="text-16 font-medium">Synced</span><span className="ml-auto font-mono text-16 font-medium text-secondary">{seconds} s</span></> : null}
      {state === "syncing" ? <><span className="text-16 font-medium">Syncing</span><span className="ml-auto font-mono text-16 font-medium text-secondary">{seconds} s</span></> : null}
      {state === "failed" ? <><span className="text-16 font-medium">Not in Unreal</span><span className="text-14 text-secondary">{failedLine.replace(/^Not in Unreal\. /, "")}</span>{onRetry ? <Button size="sm" className="ml-auto" onClick={onRetry}>Retry</Button> : null}</> : null}
      {state === "offline" ? <><span className="text-16 font-medium text-secondary">Offline</span><span className="ml-auto text-12 text-secondary">{t("mirror.offline")}</span></> : null}
    </div>
  );
}
