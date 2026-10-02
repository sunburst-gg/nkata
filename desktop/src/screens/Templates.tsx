// Templates. One file each in the project folder. Parts in order (drag to reorder), a gate per
// part, checks per part, and reference slots. Only art directors and producers edit.
import { useState } from "react";
import type { TemplatePart } from "@/data/types";
import { useCan, useStore } from "@/store";
import { Button } from "@/components/Button";
import { TemplatePartRow } from "@/components/TemplatePartRow";
import { cn } from "@/lib/cn";
import { ScreenHead } from "./Shell";

export function Templates() {
  const templates = useStore((s) => s.db.templates);
  const can = useCan();
  const [selected, setSelected] = useState(0);
  const [rows, setRows] = useState<Record<string, TemplatePart[]>>({});
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const tpl = templates[selected]!;
  const parts = rows[tpl.id] ?? tpl.parts;
  const editable = can("editTemplates");
  const move = (from: number, to: number) => {
    if (to < 0 || to >= parts.length || from === to) return;
    const next = [...parts];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row!);
    setRows({ ...rows, [tpl.id]: next });
  };
  return (
    <div className="flex flex-col gap-8">
      <ScreenHead title="Templates" line="One file each in the project folder. Parts in order, gates, checks, reference slots." actions={editable ? <Button>New template</Button> : null} />
      <div className="grid grid-cols-[240px_minmax(0,1fr)] items-start gap-12">
        <div className="flex flex-col" role="tablist" aria-label="Templates">
          {templates.map((t, i) => (
            <button type="button" role="tab" aria-selected={i === selected} key={t.id} onClick={() => setSelected(i)} className={cn("flex h-11 items-center border-b border-hairline text-left outline-none focus-visible:shadow-focus", i === selected ? "font-medium text-heading" : "text-secondary hover:text-heading")}>
              <span className="flex-1">{t.name}</span><span className="role-mono text-muted">{t.parts.length} parts</span>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-6">
          <div className="flex items-baseline gap-4"><span className="text-20 font-semibold tracking-[-0.01em]">{tpl.name}</span><span className="role-mono text-muted">used by {tpl.usedBy} assets</span><span className="ml-auto text-13 text-secondary">{tpl.tools}</span></div>
          <div className="flex flex-col">
            {parts.map((p, i) => (
              <TemplatePartRow
                key={p.id}
                part={p}
                index={i}
                editable={editable}
                active={dragFrom === i}
                onMove={(dir) => move(i, i + dir)}
                dragProps={editable ? { draggable: true, onDragStart: () => setDragFrom(i), onDragOver: (e) => e.preventDefault(), onDrop: () => { if (dragFrom !== null) move(dragFrom, i); setDragFrom(null); }, onDragEnd: () => setDragFrom(null) } : undefined}
              />
            ))}
            {editable ? <button type="button" className="flex h-13 items-center pl-13 text-left text-muted hover:text-heading">+ Add part</button> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
