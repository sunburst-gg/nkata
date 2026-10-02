import { MirrorStatus } from "./MirrorStatus";

export function MirrorStatusStates() {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
      {(["synced", "syncing", "failed", "offline"] as const).map((s) => (
        <div key={s} className="flex flex-col gap-3">
          <span className="role-mono text-muted">{s}</span>
          <MirrorStatus state={s} seconds={s === "syncing" ? 2 : 4} />
          <MirrorStatus state={s} seconds={s === "syncing" ? 2 : 4} size="large" onRetry={() => undefined} />
        </div>
      ))}
    </div>
  );
}
