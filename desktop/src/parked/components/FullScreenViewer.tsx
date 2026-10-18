// The full screen reviewer. Always dark. The model fills the window, comments on the right,
// Pin a comment in the top bar, Esc closes. Same pins and comments as the asset and part screens.
import { X } from "lucide-react";
import { useStore } from "@/store";
import { useViewerSession } from "@/lib/viewer";
import type { Asset, Part } from "@/data/types";
import { CommentRail } from "./CommentRail";
import { PinButton, Stage } from "./ModelStage";

export function FullScreenViewer() {
  const full = useStore((s) => s.fullScreen);
  const assets = useStore((s) => s.db.assets);
  const asset = full ? assets.find((a) => a.slug === full.assetSlug) : undefined;
  if (!full || !asset) return null;
  const part = full.partName ? asset.parts.find((p) => p.name === full.partName) : undefined;
  return <FullScreen asset={asset} part={part} />;
}

function FullScreen({ asset, part }: { asset: Asset; part?: Part }) {
  const setFullScreen = useStore((s) => s.setFullScreen);
  const pinning = useStore((s) => s.pinning);
  const setPinning = useStore((s) => s.setPinning);
  const session = useViewerSession(asset, part);
  const top = part?.versions[0] ?? asset.parts[0]?.versions[0];
  const caption = top ? `Last publish · v${top.n} · ${top.when}` : "No publish yet";
  return (
    <div data-theme="dark" role="dialog" aria-modal="true" aria-label={`${asset.name}${part ? ` / ${part.name}` : ""} full screen`} className="fixed inset-0 z-[45] flex flex-col bg-canvas text-body nk-fade-in">
      <div className="flex h-14 shrink-0 items-center gap-4 border-b border-hairline px-6">
        <span className="role-moment-sm text-heading">{`${asset.name}${part ? ` / ${part.name}` : ""}`}</span>
        <span className="text-13 text-secondary">{caption}</span>
        <span className="flex-1" />
        <PinButton pinning={pinning} onToggle={() => setPinning(!pinning)} />
        <span className="text-12 text-muted">Esc to close</span>
        <button type="button" aria-label="Close" onClick={() => setFullScreen(null)} className="flex size-8 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-secondary hover:bg-hover hover:text-heading"><X size={20} strokeWidth={1.5} /></button>
      </div>
      <div className="flex min-h-0 flex-1">
        <Stage session={session} aspect="" rounded={false} className="flex-1" />
        <aside className="flex w-[340px] shrink-0 flex-col overflow-auto border-l border-hairline bg-panel p-6">
          <CommentRail session={session} raised />
        </aside>
      </div>
    </div>
  );
}
