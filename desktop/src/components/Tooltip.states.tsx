import { Button } from "./Button";
import { Tooltip, TooltipProvider } from "./Tooltip";

export function TooltipStates() {
  return (
    <TooltipProvider>
      <div className="flex items-center gap-4">
        <Tooltip content="Ada · in face · 12 min"><Button>Hover me</Button></Tooltip>
        <span className="inline-flex items-center gap-2"><span className="rounded-sm bg-heading px-2 py-1.25 text-12 text-canvas shadow-1">Ada · in face · 12 min</span><span className="role-mono text-muted">12 px · inverted</span></span>
      </div>
    </TooltipProvider>
  );
}
