// Ask, Cmd K. One question, one answer: the gate, the owner, the last comment, and a link.
import { useEffect, useState } from "react";
import { useStore } from "@/store";
import type { AskAnswer } from "@/data/types";
import { useGo } from "@/lib/hooks";
import { Dialog } from "./Dialog";

export function AskOverlay() {
  const open = useStore((s) => s.askOpen);
  const setAsk = useStore((s) => s.setAsk);
  const source = useStore((s) => s.source);
  const assets = useStore((s) => s.db.assets);
  const go = useGo();
  const [text, setText] = useState("");
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  useEffect(() => { if (!open) { setText(""); setAnswer(null); } }, [open]);
  const openLink = (link: NonNullable<AskAnswer["link"]>) => {
    const asset = assets.find((a) => a.slug === link.assetSlug);
    setAsk(false);
    if (!asset) return;
    if (link.partName) go.part(asset.slug, link.partName, asset.projectSlug);
    else go.asset(asset.slug, asset.projectSlug);
  };
  return (
    <Dialog open={open} onOpenChange={setAsk} title="Ask" width={560} top className="gap-0 p-0">
      <input autoFocus value={text} onChange={(e) => { setText(e.target.value); setAnswer(null); }} onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) setAnswer(source.ask(text.trim())); }} placeholder="Ask about the project" aria-label="Ask about the project" className="h-13 border-0 border-b border-hairline bg-transparent px-4 text-16 text-heading outline-none placeholder:text-muted" />
      {answer ? (
        <div className="flex flex-col gap-3 p-4 leading-[1.5]">
          <span className="text-heading">{answer.answer}</span>
          {answer.note ? <span className="text-13 text-secondary">{answer.note}</span> : null}
          {answer.link ? <button type="button" onClick={() => openLink(answer.link!)} className="cursor-pointer self-start border-0 bg-transparent p-0 text-13 text-accent-text hover:underline">{answer.link.label}</button> : null}
        </div>
      ) : null}
      <span className="border-t border-hairline px-4 py-2 text-12 text-muted">Enter to ask · Esc to close</span>
    </Dialog>
  );
}
