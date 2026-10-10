// shadcn Dialog (Radix), restyled to v3: 560 or 440 wide, bg-panel, border-border, radius 12,
// shadow-modal, 24 px padding, a serif title with × on the right. 300 ms in. Esc and the scrim close.
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Read by assistive tech. The prototype shows no visible description on most dialogs. */
  description?: string;
  children?: ReactNode;
  width?: number;
  closeButton?: boolean;
  /** Top aligned, for Ask. */
  top?: boolean;
  className?: string;
}

export function Dialog({ open, onOpenChange, title, description, children, width = 440, closeButton = false, top = false, className }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)] data-[state=open]:nk-fade-in" />
        <RadixDialog.Content
          style={{ width }}
          aria-describedby={description ? undefined : ""}
          className={cn("fixed left-1/2 z-50 flex max-h-[80%] max-w-[calc(100vw-64px)] -translate-x-1/2 flex-col gap-4 overflow-auto rounded-xl border border-border bg-panel p-6 shadow-modal outline-none data-[state=open]:nk-panel-in", top ? "top-[120px]" : "top-1/2 -translate-y-1/2", className)}
        >
          <div className={cn("flex items-center", top && "sr-only")}>
            <RadixDialog.Title className="role-moment-md m-0 text-heading">{title}</RadixDialog.Title>
            {closeButton ? (
              <RadixDialog.Close aria-label="Close" className="ml-auto flex size-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-muted hover:bg-hover hover:text-heading">
                <X size={18} strokeWidth={1.5} />
              </RadixDialog.Close>
            ) : null}
          </div>
          {description ? <RadixDialog.Description className="text-14 leading-[1.5] text-secondary">{description}</RadixDialog.Description> : null}
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
