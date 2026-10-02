// InviteSheet. 520 wide. Email, the six roles, copy link, Send invite. Only a producer opens it.
import { useState } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { Role } from "@/auth/permissions";
import { Button } from "./Button";
import { Input } from "./Input";
import { RolePicker } from "./RolePicker";

export interface InviteSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  inviteLink: string;
  defaultEmail?: string;
  defaultRole?: Role;
  onSend: (email: string, role: Role) => void;
}

export function InviteSheet({ open, onOpenChange, projectName, inviteLink, defaultEmail = "", defaultRole = "viewer", onSend }: InviteSheetProps) {
  const [email, setEmail] = useState(defaultEmail);
  const [role, setRole] = useState<Role>(defaultRole);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(inviteLink).catch(() => undefined);
    setCopied(true);
  };
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)] data-[state=open]:nk-fade-in" />
        <RadixDialog.Content className="fixed left-1/2 top-1/2 z-50 flex w-130 -translate-x-1/2 -translate-y-1/2 flex-col gap-6 rounded-xl border border-border bg-panel p-7 shadow-2 outline-none data-[state=open]:nk-panel-in">
          <div className="flex items-baseline"><RadixDialog.Title className="text-20 font-semibold tracking-[-0.01em]">Invite to {projectName}</RadixDialog.Title><RadixDialog.Close aria-label="Close" className="ml-auto flex size-7 items-center justify-center rounded-md text-muted hover:bg-hover"><X size={16} strokeWidth={1.75} /></RadixDialog.Close></div>
          <RadixDialog.Description className="sr-only">Pick a role and send an invite.</RadixDialog.Description>
          <Input large type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@studio.com" aria-label="Email" className="bg-canvas" />
          <RolePicker value={role} onChange={setRole} />
          <div className="flex items-center gap-4">
            <button type="button" onClick={copy} className="text-13 text-secondary hover:text-heading">{copied ? "Copied" : "Copy link"}</button>
            <span className="flex-1" />
            <Button variant="primary" onClick={() => onSend(email, role)}>Send invite</Button>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
