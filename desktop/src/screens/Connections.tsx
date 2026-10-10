// Connections. A grid of the tools on this computer: Blender and Unreal with the version found,
// Discord, and the ones that arrive later marked Soon. Detection runs on every launch.
import { useState } from "react";
import { useCan, useStore } from "@/store";
import { Button } from "@/components/Button";
import { ToolLogo } from "@/components/Logo";
import type { Connection } from "@/data/types";
import { Title } from "./Shell";

export function ConnectionGrid() {
  const connections = useStore((s) => s.db.connections);
  const source = useStore((s) => s.source);
  const toast = useStore((s) => s.toast);
  const can = useCan();
  const [busy, setBusy] = useState<string | null>(null);
  const connect = async (c: Connection) => {
    setBusy(c.id);
    try {
      await source.connect(c.id);
      toast(`${c.name} connected.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : `${c.name} did not connect.`, "failed");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="grid grid-cols-2 gap-6">
      {connections.map((c) => (
        <div key={c.id} className="flex flex-col gap-3.5 rounded-xl border border-hairline bg-panel p-4" style={{ opacity: c.soon ? 0.6 : 1 }}>
          <ToolLogo id={c.id} name={c.name} />
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-heading">{c.name}</span>
              {c.soon ? <span className="rounded-[5px] bg-raised px-1.5 text-12 text-secondary">Soon</span> : null}
              {c.connected ? <span className="ml-auto inline-flex items-center gap-1.5 text-13 text-secondary"><span aria-hidden="true" className="size-[7px] rounded-full bg-state-approved" />Connected</span> : null}
            </div>
            <span className="text-13 leading-[1.5] text-secondary">{c.line}</span>
          </div>
          {!c.soon && !c.connected && can("connectTools") ? <Button size="sm" variant="outline" className="self-start" loading={busy === c.id} onClick={() => void connect(c)}>Connect</Button> : null}
        </div>
      ))}
    </div>
  );
}

export function Connections() {
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-8 pt-6">
      <div className="flex flex-col gap-2"><Title>Connections</Title><span className="text-secondary">Nkata connects to the tools on this computer. More tools arrive over time.</span></div>
      <ConnectionGrid />
    </div>
  );
}
