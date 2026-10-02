// CheckRow. Glyph 16, name 14, detail 13. Fix is a sm secondary button on the row, right column.
import { Check, Minus, X } from "lucide-react";
import type { Check as CheckModel } from "@/data/types";
import { cn } from "@/lib/cn";
import { Button, Spinner } from "./Button";

export interface CheckRowProps {
  check: CheckModel;
  onFix?: () => void;
  /** Hidden for a viewer: the button is not rendered. */
  canFix?: boolean;
}

function Glyph({ status }: { status: CheckModel["status"] }) {
  const common = { size: 14, strokeWidth: 2.4, "aria-hidden": true } as const;
  switch (status) {
    case "pass": return <span className="text-state-approved"><Check {...common} /></span>;
    case "fail": return <span className="text-state-failed"><X {...common} /></span>;
    case "warn": return <span className="text-accent"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M8 3v6M8 12v.5" /></svg></span>;
    case "running": return <span className="text-secondary"><Spinner /></span>;
    case "waiting": return <span className="text-disabled"><Minus {...common} /></span>;
  }
}

export function CheckRow({ check, onFix, canFix = true }: CheckRowProps) {
  const emphasised = check.status === "fail" || check.status === "warn";
  return (
    <div className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-3">
      <span className="flex h-5 items-center"><Glyph status={check.status} /></span>
      <span className="flex flex-col gap-0.5">
        <span className={cn("text-14", emphasised ? "text-heading" : check.status === "waiting" ? "text-muted" : "text-body")}>{check.name}</span>
        <span className="text-13 text-secondary">{check.detail}</span>
      </span>
      <span className="flex h-5 items-center">
        {check.fixable && check.status !== "pass" && canFix && onFix ? <Button size="sm" onClick={onFix}>Fix</Button> : <span className="role-mono text-muted">{check.status === "fail" ? (check.blocks ? "blocks" : "fail") : check.status === "warn" ? "warn" : check.status === "running" ? "running" : check.status === "waiting" ? "waiting" : ""}</span>}
      </span>
    </div>
  );
}
