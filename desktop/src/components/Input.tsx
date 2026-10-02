// shadcn Input, restyled. h 36, radius-md, bg-panel, border-border. Error takes the failed color.
import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  /** Large: h 44, radius-lg, for sign in. */
  large?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ error, large, className, id, ...rest }, ref) {
  const errorId = error && id ? `${id}-error` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={cn(
          "w-full bg-panel text-heading placeholder:text-muted border px-3 outline-none transition-[border-color] duration-150",
          "focus:border-accent focus:shadow-focus disabled:bg-raised disabled:text-disabled disabled:border-hairline",
          error ? "border-state-failed" : "border-border",
          large ? "h-11 rounded-lg px-3.5 text-15" : "h-9 rounded-md text-14",
          className,
        )}
        {...rest}
      />
      {error ? <span id={errorId} className="text-12 text-state-failed">{error}</span> : null}
    </div>
  );
});

/** A row in a settings style list: label, value, trailing action. h 52, hairline below. */
export function FieldRow({ label, children, trailing, border = "hairline" }: { label: string; children: React.ReactNode; trailing?: React.ReactNode; border?: "hairline" | "border" }) {
  return (
    <div className={cn("flex h-13 items-center gap-4 border-b", border === "hairline" ? "border-hairline" : "border-border")}>
      <span className="w-30 text-13 text-muted">{label}</span>
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      {trailing}
    </div>
  );
}
