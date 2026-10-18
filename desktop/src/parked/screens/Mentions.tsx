// Mentions. Comments that name you, newest first. Click opens the part.
import { useStore } from "@/store";
import { PresenceAvatar } from "@/components/PresenceAvatar";
import { firstName, useGo, usePeople } from "@/lib/hooks";
import { Title } from "./Shell";

export function Mentions() {
  const mentions = useStore((s) => s.db.mentions);
  const assets = useStore((s) => s.db.assets);
  const { by } = usePeople();
  const go = useGo();
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-6 pt-6">
      <Title>Mentions</Title>
      {mentions.length === 0 ? <span className="text-secondary">No mentions yet.</span> : null}
      {mentions.map((m) => {
        const p = by(m.authorId);
        const asset = assets.find((a) => a.slug === m.assetSlug);
        const open = () => { if (!asset) return; if (m.partName) go.part(asset.slug, m.partName, asset.projectSlug); else go.asset(asset.slug, asset.projectSlug); };
        return (
          <button key={m.id} type="button" onClick={open} className="flex cursor-pointer gap-3 rounded-xl border border-hairline bg-panel p-4 text-left transition-shadow duration-150 hover:shadow-soft">
            <PresenceAvatar initial={p.initial} tone={p.tone} name={p.name} size={32} />
            <div className="flex flex-col gap-1">
              <span className="text-13"><span className="font-medium text-heading">{firstName(p.name)}</span> <span className="text-muted">on {m.on} · {m.when}</span></span>
              <span className="text-14 text-body">{m.text}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
