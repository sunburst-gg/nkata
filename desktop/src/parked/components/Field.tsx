// Form pieces from the v3 prototype: a 13 px secondary label over a 44 px control with a 10 px
// radius, a native select styled to the tokens, and the 36 by 20 switch.
import { ChevronDown } from "lucide-react";
import type { ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-2", className)}>
      <span className="text-13 text-secondary">{label}</span>
      {children}
      {hint ? <span className="text-13 text-muted">{hint}</span> : null}
    </label>
  );
}

/** The 44 px control box: radius 10, panel background, border. Inputs and the folder row share it. */
export const CONTROL = "h-11 w-full rounded-[10px] border border-border bg-panel px-3.5 text-14 text-heading outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted focus:border-accent focus:shadow-focus";

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative inline-flex w-full">
      <select className={cn(CONTROL, "appearance-none pr-9 cursor-pointer", className)} {...rest}>{children}</select>
      <ChevronDown size={14} strokeWidth={1.5} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
    </span>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn("relative h-5 w-9 shrink-0 cursor-pointer rounded-full border-0 p-0 transition-colors duration-150 outline-none focus-visible:shadow-focus", on ? "bg-accent" : "bg-border")}
    >
      <span aria-hidden="true" className="absolute top-0.5 size-4 rounded-full bg-[var(--avatar-fg)] transition-[left] duration-150" style={{ left: on ? 18 : 2 }} />
    </button>
  );
}
