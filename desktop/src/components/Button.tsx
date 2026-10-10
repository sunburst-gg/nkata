// shadcn Button, restyled. h 36 md, 28 sm, radius-md, pad 0 14, weight 500.
// primary is the one amber fill on a screen. danger is for Remove gate.
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "inverted";
export type ButtonSize = "lg" | "md" | "sm" | "xs";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg border-transparent hover:bg-accent-hover active:bg-accent-pressed",
  secondary: "bg-panel text-heading border-border hover:bg-hover active:bg-active",
  ghost: "bg-transparent text-heading border-transparent hover:bg-hover active:bg-active",
  /** A bordered button on the page, no fill. The small actions beside the viewer. */
  outline: "bg-transparent text-heading border-border hover:bg-hover active:bg-active",
  danger: "bg-state-failed text-[var(--avatar-fg)] border-transparent hover:opacity-90 disabled:bg-state-failed disabled:text-[var(--avatar-fg)] disabled:opacity-40",
  inverted: "bg-heading text-canvas border-transparent hover:opacity-90",
};

const SIZE: Record<ButtonSize, string> = {
  /** The form button: 44 high, radius 10. */
  lg: "h-11 px-5 text-14 rounded-[10px] gap-2",
  md: "h-9 px-3.5 text-14 rounded-[10px] gap-2",
  sm: "h-8 px-3 text-13 rounded-lg gap-2",
  xs: "h-7 px-2.5 text-13 rounded-lg gap-1.5",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "secondary", size = "md", loading = false, icon, className, children, disabled, type = "button", ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap border font-medium cursor-pointer select-none transition-[background-color,border-color,color] duration-150",
        "disabled:bg-raised disabled:text-disabled disabled:border-transparent disabled:cursor-not-allowed",
        loading && "cursor-wait",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("nk-spin inline-block size-3 rounded-full border-2 border-current border-t-transparent", className)} />;
}

/** 28 px square icon button. */
export function IconButton({ label, className, size = "sm", ...rest }: ButtonProps & { label: string }) {
  return <Button aria-label={label} title={label} size={size} className={cn(size === "xs" ? "w-7 px-0" : size === "sm" ? "w-8 px-0" : "w-9 px-0", className)} {...rest} />;
}
