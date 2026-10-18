// Comments beside the model: the list with pin numbers, and the composer. While a pin is pending
// the composer is a boxed card with "Pin N" and "Say what you see"; otherwise one input.
import { useStore } from "@/store";
import type { ViewerSession } from "@/lib/viewer";
import { cn } from "@/lib/cn";
import { firstName, usePeople } from "@/lib/hooks";
import { Button } from "./Button";
import { PinDot } from "./ModelStage";
import { PresenceAvatar } from "./PresenceAvatar";

export function CommentRail({ session, emptyText = "No comments yet. Pin one on the model.", selectable = true, raised = false }: { session: ViewerSession; emptyText?: string; selectable?: boolean; raised?: boolean }) {
  const activePin = useStore((s) => s.activePin);
  const setActivePin = useStore((s) => s.setActivePin);
  const pendingPin = useStore((s) => s.pendingPin);
  const draft = useStore((s) => s.draft);
  const setDraft = useStore((s) => s.setDraft);
  const { by } = usePeople();
  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") session.post(); };
  return (
    <div className="flex flex-col gap-4">
      <span className="role-moment-sm text-heading">Comments</span>
      {session.comments.length === 0 ? <span className="text-13 text-secondary">{emptyText}</span> : null}
      {session.comments.map((c) => {
        const p = by(c.authorId);
        const n = c.pos ? session.pinNo(c) : 0;
        const active = selectable && activePin === c.id;
        const Row = selectable ? "button" : "div";
        return (
          <Row key={c.id} type={selectable ? "button" : undefined} onClick={selectable ? () => setActivePin(c.pos ? c.id : null) : undefined} className={cn("-m-2 flex gap-2.5 rounded-[10px] border-0 p-2 text-left text-14 text-body transition-colors duration-150", selectable && "cursor-pointer hover:bg-hover", active ? "bg-active" : "bg-transparent")}>
            <PresenceAvatar initial={p.initial} tone={p.tone} name={p.name} size={28} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-13"><span className="font-medium text-heading">{firstName(p.name)}</span><span className="text-muted">{c.when}</span>
                {n ? <span aria-label={`Pin ${n}`} className="ml-auto inline-flex size-[18px] items-center justify-center bg-accent text-10 font-semibold text-accent-fg" style={{ borderRadius: "9px 9px 9px 2px" }}>{n}</span> : null}
              </span>
              <span>{c.text}</span>
            </div>
          </Row>
        );
      })}
      {pendingPin ? (
        <div className={cn("flex flex-col gap-2 rounded-[10px] border border-accent p-3", raised ? "bg-raised" : "bg-panel")}>
          <span className="flex items-center gap-1.5 text-12 text-secondary"><PinDot size={14} />Pin {session.nextPinNo}</span>
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} placeholder="Say what you see" aria-label="Comment" className="h-9 rounded-lg border border-border bg-panel px-2.5 text-14 text-heading outline-none placeholder:text-muted focus:border-accent" />
          <div className="flex justify-end gap-2"><Button size="xs" variant="outline" onClick={session.cancel}>Cancel</Button><Button size="xs" variant="primary" onClick={session.post}>Post</Button></div>
        </div>
      ) : (
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} placeholder="Write a comment" aria-label="Write a comment" className={cn("h-10 rounded-[10px] border border-border px-3 text-14 text-heading outline-none placeholder:text-muted focus:border-accent", raised ? "bg-raised" : "bg-panel")} />
      )}
    </div>
  );
}
