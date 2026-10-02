// CommentThread. A list of pinned comments and the input. The input stays for every role.
import { useState } from "react";
import type { Comment, Person } from "@/data/types";
import { cn } from "@/lib/cn";
import { CommentPin } from "./CommentPin";

export interface CommentThreadProps {
  comments: Comment[];
  people: Person[];
  /** Shows "on {part}" in the meta line, for the asset view. */
  showPart?: boolean;
  activeN?: number;
  onAdd?: (text: string) => void;
  onPick?: (n: number) => void;
  placeholder?: string;
  title?: string;
  countLabel?: string;
}

export function CommentThread({ comments, people, showPart, activeN, onAdd, onPick, placeholder = "Comment", title = "Comments", countLabel }: CommentThreadProps) {
  const [text, setText] = useState("");
  const by = (id: string) => people.find((p) => p.id === id);
  const submit = () => {
    const v = text.trim();
    if (!v || !onAdd) return;
    onAdd(v);
    setText("");
  };
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between"><span className="text-16 font-medium">{title}</span><span className="role-mono text-muted">{countLabel ?? comments.length}</span></div>
      {comments.map((c) => {
        const author = by(c.authorId);
        return (
          <div key={c.id} className={cn("flex gap-3", c.resolved && "opacity-60")}>
            <CommentPin n={c.n} tone={c.resolved ? "resolved" : activeN === c.n ? "active" : "default"} onClick={onPick ? () => onPick(c.n) : undefined} />
            <div className="flex min-w-0 flex-col gap-1 text-14 leading-[1.45]">
              <span><span className="font-medium">{author?.name.split(" ")[0] ?? "Someone"}</span> <span className="text-muted">{showPart ? `on ${c.partName} · ` : `${c.source} · `}{c.when}</span></span>
              <span className={cn("text-body", c.resolved && "line-through")}>{c.text}</span>
            </div>
          </div>
        );
      })}
      {onAdd ? (
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-10 w-full rounded-md border border-border bg-transparent px-3 text-14 text-heading outline-none placeholder:text-muted focus:border-accent focus:shadow-focus" />
        </form>
      ) : null}
    </div>
  );
}
