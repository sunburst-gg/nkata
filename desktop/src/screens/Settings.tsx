// Settings. Tools, connections, project folder, invite link, export everything. Producers only.
import { useState } from "react";
import { useCan, useStore } from "@/store";
import { Button } from "@/components/Button";
import { StateDot } from "@/components/StateBadge";
import { useProject } from "@/lib/hooks";
import { ScreenHead } from "./Shell";

function Row({ label, children, trailing, dot }: { label: string; children?: React.ReactNode; trailing?: React.ReactNode; dot?: boolean }) {
  return <div className="flex h-13 items-center gap-4 border-b border-hairline">{dot ? <StateDot state="approved" /> : null}<span className="flex-1">{label}</span>{children}{trailing}</div>;
}
const change = <button type="button" className="text-13 text-secondary hover:text-heading">Change</button>;

export function Settings() {
  const project = useProject();
  const can = useCan();
  const toast = useStore((s) => s.toast);
  const source = useStore((s) => s.source);
  const [webhook, setWebhook] = useState("");
  if (!can("viewSettings")) return <span className="text-secondary">Settings are for producers.</span>;
  return (
    <div className="flex max-w-180 flex-col gap-10">
      <ScreenHead title="Settings" line={`${project.name} · Producers are admins.`} />
      <div className="flex flex-col gap-3"><span className="text-16 font-medium">Tools</span><div className="flex flex-col"><Row label="Blender" trailing={change}><span className="font-mono text-14 font-medium">{project.blender}</span></Row><Row label="Unreal Engine" trailing={change}><span className="font-mono text-14 font-medium">{project.unreal}</span></Row></div><span className="text-13 text-muted">Panels warn when a teammate runs a different version.</span></div>
      <div className="flex flex-col gap-3"><span className="text-16 font-medium">Connections</span><div className="flex flex-col">
        {source.setDiscordWebhook ? (
          <form className="flex h-13 items-center gap-4 border-b border-hairline" onSubmit={(e) => { e.preventDefault(); void source.setDiscordWebhook!(webhook.trim() || null).then(() => toast(webhook.trim() ? "Discord gets one message on Approve or Send back." : "Discord disconnected.", "approved")).catch((err: unknown) => toast(err instanceof Error ? err.message : "Could not save the webhook.", "failed")); }}>
            <span className="w-24">Discord</span>
            <input value={webhook} onChange={(e) => setWebhook(e.target.value)} aria-label="Discord webhook URL" placeholder="Webhook URL" className="min-w-0 flex-1 bg-transparent text-14 text-heading outline-none" />
            <Button size="sm" className="h-8" type="submit">Save</Button>
          </form>
        ) : <Row label="Discord" dot trailing={change}><span className="text-13 text-secondary">#rising-sun-art · one message on Approve or Send back</span></Row>}
      </div></div>
      <div className="flex flex-col gap-3"><span className="text-16 font-medium">Project</span><div className="flex flex-col"><Row label="Folder"><span className="font-mono text-14 font-medium text-body">{project.folder}</span></Row><Row label="Invite link" trailing={<button type="button" onClick={() => { void navigator.clipboard?.writeText(project.inviteLink).catch(() => undefined); toast("Invite link copied.", "approved"); }} className="text-13 text-secondary hover:text-heading">Copy</button>}><span className="font-mono text-14 font-medium text-body">{project.inviteLink}</span></Row><Row label="Export everything" trailing={<Button size="sm" className="h-8" onClick={() => toast(`Exporting ${project.name} to plain folders, ${project.sizeLabel}.`, "synced")}>Export</Button>}><span className="text-13 text-secondary">Plain folders, {project.sizeLabel}</span></Row></div></div>
    </div>
  );
}
