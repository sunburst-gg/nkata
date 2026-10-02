import { useState } from "react";
import { Button } from "./Button";
import { InviteSheet } from "./InviteSheet";

export function InviteSheetStates() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button onClick={() => setOpen(true)}>Open the invite sheet</Button>
      <InviteSheet open={open} onOpenChange={setOpen} projectName="Rising Sun" inviteLink="nkata.app/join/rising-sun-7f3a" defaultEmail="funmi@lagosinteractive.com" onSend={() => setOpen(false)} />
    </div>
  );
}
