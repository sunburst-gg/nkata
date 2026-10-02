// shadcn DropdownMenu (Radix) restyled: 200 to 260 wide, bg-panel, border-border, radius-lg, shadow-2,
// rows h 36, hover bg-hover. Shared by ProjectMenu, AccountMenu, and the studio menu.
import * as RadixMenu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function MenuRoot(props: RadixMenu.DropdownMenuProps) {
  return <RadixMenu.Root modal={false} {...props} />;
}
export const MenuTrigger = RadixMenu.Trigger;

export function MenuContent({ children, width = 200, align = "start" }: { children: ReactNode; width?: number; align?: "start" | "end" }) {
  return (
    <RadixMenu.Portal>
      <RadixMenu.Content align={align} sideOffset={8} style={{ width }} className="z-40 flex flex-col rounded-lg border border-border bg-panel p-1.5 text-14 font-normal text-body shadow-2 outline-none data-[state=open]:nk-panel-in">
        {children}
      </RadixMenu.Content>
    </RadixMenu.Portal>
  );
}

export function MenuItem({ children, onSelect, muted, trailing, className, selected }: { children: ReactNode; onSelect?: () => void; muted?: boolean; trailing?: ReactNode; className?: string; selected?: boolean }) {
  return (
    <RadixMenu.Item onSelect={onSelect} className={cn("flex h-9 cursor-pointer items-center gap-2.5 rounded-sm px-2.5 outline-none data-[highlighted]:bg-hover", muted && "text-secondary", selected && "bg-active text-heading", className)}>
      {children}
      {trailing ? <span className="role-mono ml-auto text-muted">{trailing}</span> : null}
    </RadixMenu.Item>
  );
}

export function MenuSeparator() {
  return <RadixMenu.Separator className="mx-1 my-1.5 h-px bg-hairline" />;
}
