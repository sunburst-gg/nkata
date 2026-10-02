// shadcn Dialog (Radix), restyled. 420 wide, bg-panel, border-border, radius-xl, shadow-2.
// 300 ms in, 150 ms out. The safe choice takes the first focus.
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons, right aligned. */
  actions?: ReactNode;
  width?: number;
  closeButton?: boolean;
}

export function Dialog({ open, onOpenChange, title, description, children, actions, width = 440, closeButton = false }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)] data-[state=open]:nk-fade-in" />
        <RadixDialog.Content
          style={{ width }}
          className={cn("fixed left-1/2 top-1/2 z-50 flex max-w-[calc(100vw-64px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-xl border border-border bg-panel p-7 shadow-2 outline-none", "data-[state=open]:nk-panel-in")}
        >
          <div className="flex items-baseline">
            <RadixDialog.Title className="text-20 font-semibold tracking-[-0.01em]">{title}</RadixDialog.Title>
            {closeButton ? (
              <RadixDialog.Close aria-label="Close" className="ml-auto flex size-7 items-center justify-center rounded-md text-muted hover:bg-hover">
                <X size={16} strokeWidth={1.75} />
              </RadixDialog.Close>
            ) : null}
          </div>
          {description ? <RadixDialog.Description className="text-14 leading-[1.5] text-body">{description}</RadixDialog.Description> : null}
          {children}
          {actions ? <div className="flex justify-end gap-2">{actions}</div> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
