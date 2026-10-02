// CommentPin. 24 px teardrop, numbered. Active is amber with a soft ring. Resolved is hollow.
import { cn } from "@/lib/cn";

export interface CommentPinProps {
  n: number;
  tone?: "default" | "active" | "resolved";
  size?: 20 | 24;
  className?: string;
  /** Position on a preview, in percent. */
  at?: { x: number; y: number };
  onClick?: () => void;
}

export function CommentPin({ n, tone = "default", size = 24, className, at, onClick }: CommentPinProps) {
  const style: React.CSSProperties = { width: size, height: size, fontSize: size === 20 ? 10 : 11, ...(at ? { position: "absolute", left: `${at.x}%`, top: `${at.y}%` } : {}) };
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-label={`Comment ${n}`}
      style={style}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[50%_50%_50%_0] font-semibold transition-colors duration-150",
        tone === "default" && "bg-heading text-canvas",
        tone === "active" && "bg-accent text-accent-fg shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_30%,transparent)]",
        tone === "resolved" && "border-2 border-muted bg-[var(--scrim)] text-heading opacity-70",
        className,
      )}
    >
      {n}
    </Tag>
  );
}
