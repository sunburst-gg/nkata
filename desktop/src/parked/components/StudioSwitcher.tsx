// Switch studio: the account's studios, the current one marked, and New studio. One account,
// many studios; the session moves into the one picked.
import { useState } from "react";
import { Check } from "lucide-react";
import { ROLE_WORDS } from "@/auth/permissions";
import { useStore } from "@/store";
import { routeFor, switchServerStudio } from "@/data/boot";
import { cn } from "@/lib/cn";
import { useGo } from "@/lib/hooks";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { reasonOf } from "@/lib/reason";

export function StudioSwitcher({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const studios = useStore((s) => s.db.session.studios);
  const current = useStore((s) => s.db.session.studio.id);
  const source = useStore((s) => s.source);
  const serverMode = useStore((s) => s.serverMode);
  const useSource = useStore((s) => s.useSource);
  const theme = useStore((s) => s.theme);
  const toast = useStore((s) => s.toast);
  const go = useGo();
  const [busy, setBusy] = useState<string | null>(null);
  const pick = async (id: string) => {
    if (id === current) { onOpenChange(false); return; }
    setBusy(id);
    try {
      if (serverMode) {
        const next = await switchServerStudio(id, theme);
        useSource(next);
        go.to(routeFor(next));
      } else {
        await source.switchStudio(id);
        const first = useStore.getState().db.session.studio.projects[0];
        if (first) go.project(first.slug); else go.welcome();
      }
      onOpenChange(false);
    } catch (err) {
      toast(reasonOf(err, "Could not switch studio."), "failed");
    } finally {
      setBusy(null);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Switch studio" width={440} closeButton>
      <div className="flex flex-col">
        {studios.map((s) => (
          <button key={s.id} type="button" onClick={() => void pick(s.id)} disabled={busy !== null} className={cn("flex h-11 cursor-pointer items-center gap-3 border-b border-hairline bg-transparent px-1 text-left text-14 text-heading hover:bg-hover", busy === s.id && "opacity-60")}>
            <span aria-hidden="true" className="inline-flex size-6 items-center justify-center rounded-md bg-[var(--avatar-9)] text-12 font-semibold text-[var(--avatar-fg)]">{s.name.charAt(0).toUpperCase()}</span>
            <span className="flex-1 truncate">{s.name}</span>
            <span className="text-13 text-secondary">{s.roles.map((r) => ROLE_WORDS[r]).join(", ")}</span>
            {s.id === current ? <Check size={14} strokeWidth={2} aria-label="Current" className="text-accent-text" /> : null}
          </button>
        ))}
      </div>
      <Button variant="outline" className="self-start" onClick={() => { onOpenChange(false); go.studio(); }}>New studio</Button>
    </Dialog>
  );
}
