// TemplatePartRow. Drag handle 16, order in mono, inline name, gate select, check chips, refs.
// h 52, hairline below. Reorder with the handle (drag) or the keyboard (Alt plus arrows).
import { ChevronDown, GripVertical } from "lucide-react";
import type { TemplatePart } from "@/data/types";
import { cn } from "@/lib/cn";

export interface TemplatePartRowProps {
  part: TemplatePart;
  index: number;
  active?: boolean;
  editable?: boolean;
  onRename?: (name: string) => void;
  onGate?: () => void;
  onMove?: (dir: -1 | 1) => void;
  dragProps?: React.HTMLAttributes<HTMLDivElement>;
}

export function gateLabel(gate: string[]): string {
  return gate.length === 0 ? "No gate" : `After ${gate.join(", ")}`;
}

export function TemplatePartRow({ part, index, active, editable = true, onRename, onGate, onMove, dragProps }: TemplatePartRowProps) {
  return (
    <div {...dragProps} className={cn("grid h-13 grid-cols-[16px_28px_minmax(0,1fr)_220px_minmax(0,1.4fr)_60px] items-center gap-6 border-b border-hairline px-2", active && "bg-hover", dragProps?.className)}>
      {editable ? (
        <button type="button" aria-label={`Move ${part.name}`} onKeyDown={(e) => { if (e.altKey && e.key === "ArrowUp") onMove?.(-1); if (e.altKey && e.key === "ArrowDown") onMove?.(1); }} className="flex cursor-grab items-center text-disabled hover:text-secondary"><GripVertical size={16} strokeWidth={1.75} /></button>
      ) : <span />}
      <span className="role-mono text-muted">{index + 1}</span>
      {editable ? (
        <input defaultValue={part.name} onBlur={(e) => onRename?.(e.target.value)} aria-label="Part name" className={cn("w-fit max-w-full border-b bg-transparent py-0.5 font-medium text-heading outline-none focus:border-accent", active ? "border-accent" : "border-transparent")} />
      ) : <span className="font-medium">{part.name}</span>}
      {editable ? (
        <button type="button" onClick={onGate} className="inline-flex h-7 w-fit max-w-full items-center gap-1.5 truncate rounded-sm border border-border px-2.5 text-13 text-body hover:bg-hover"><span className="truncate">{gateLabel(part.gate)}</span><ChevronDown size={10} strokeWidth={2} aria-hidden="true" /></button>
      ) : <span className="truncate text-13 text-secondary">{gateLabel(part.gate)}</span>}
      <span className="flex gap-1.5 overflow-hidden text-12 text-secondary">{part.checks.map((c) => <span key={c} className="whitespace-nowrap rounded-sm border border-border px-1.5 py-0.5">{c}</span>)}</span>
      <span className="role-mono text-right text-muted">{part.refs} refs</span>
    </div>
  );
}
