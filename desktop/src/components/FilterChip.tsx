// FilterChip. h 28, pill, 13 px. Active inverts to the heading color. A count sits in mono.
import { cn } from "@/lib/cn";

export interface FilterChipProps {
  label: string;
  active?: boolean;
  count?: number;
  onClick?: () => void;
}

export function FilterChip({ label, active, count, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-13 transition-colors duration-150",
        active ? "border-heading bg-heading font-medium text-canvas" : "border-border text-body hover:bg-hover",
      )}
    >
      {label}
      {count !== undefined ? <span className={cn("role-mono", active ? "opacity-70" : "text-muted")}>{count}</span> : null}
    </button>
  );
}
