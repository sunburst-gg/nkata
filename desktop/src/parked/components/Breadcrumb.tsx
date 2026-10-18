// Breadcrumb. The only navigation: Sunburst / Rising Sun / Ojukwu / face. Slashes in the disabled
// color, the current item in heading weight 500. Items with menus render their trigger.
import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Mark } from "./Mark";

export interface Crumb {
  label: string;
  onClick?: () => void;
  current?: boolean;
  /** A dropdown trigger rendered in place of a plain label. */
  render?: (className: string) => ReactNode;
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2.5 text-14 text-secondary">
      <Mark size={18} className="text-secondary" />
      {items.map((c, i) => {
        const cls = cn("inline-flex items-center gap-1.5 rounded-sm outline-none focus-visible:shadow-focus", c.current ? "font-medium text-heading" : "text-secondary hover:text-heading", (c.onClick || c.render) && "cursor-pointer");
        return (
          <Fragment key={`${c.label}-${i}`}>
            {i > 0 ? <span aria-hidden="true" className="text-disabled">/</span> : null}
            {c.render ? c.render(cls) : c.onClick ? <button type="button" onClick={c.onClick} aria-current={c.current ? "page" : undefined} className={cls}>{c.label}</button> : <span aria-current={c.current ? "page" : undefined} className={cls}>{c.label}</span>}
          </Fragment>
        );
      })}
    </nav>
  );
}
