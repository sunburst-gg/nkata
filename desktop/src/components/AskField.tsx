// AskField. h 44, radius-lg. A slot only in v1: no AI. The field opens nothing yet.
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";

export interface AskFieldProps {
  placeholder?: string;
  /** The answer card below the field, when there is one. */
  answer?: React.ReactNode;
  className?: string;
}

export function AskField({ placeholder = "Ask. What is blocking Ojukwu", answer, className }: AskFieldProps) {
  return (
    <div className={cn("flex flex-col rounded-lg border border-border bg-panel", answer ? "shadow-2" : null, className)}>
      <label className={cn("flex h-11 items-center gap-2.5 px-3.5 text-muted", answer ? "border-b border-hairline text-heading" : null)}>
        <Search size={16} strokeWidth={1.75} aria-hidden="true" />
        <input type="text" placeholder={placeholder} aria-label="Ask" className="min-w-0 flex-1 bg-transparent text-14 text-heading outline-none placeholder:text-muted" />
        <kbd className="role-mono rounded-sm border border-border px-1.5 py-px text-secondary">⌘K</kbd>
      </label>
      {answer ? <div className="flex flex-col gap-2 p-3.5 text-14 leading-[1.45] text-body">{answer}</div> : null}
    </div>
  );
}
