import { useState } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

export function DialogStates() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <div><Button onClick={() => setOpen(true)}>Open the gate dialog</Button></div>
      <div className="flex w-105 flex-col gap-4 rounded-xl border border-border bg-panel p-6 shadow-2">
        <span className="text-16 font-semibold">Remove the gate on textures?</span>
        <span className="text-14 leading-[1.45] text-body">Ngozi can start before face is approved. This is logged on the asset timeline.</span>
        <div className="flex justify-end gap-2"><Button autoFocus>Keep gate</Button><Button variant="primary">Remove gate</Button></div>
      </div>
      <Dialog open={open} onOpenChange={setOpen} title="Remove the gate on textures?" description="Ngozi can start before face is approved. This is logged on the asset timeline." actions={<><Button autoFocus onClick={() => setOpen(false)}>Keep gate</Button><Button variant="primary" onClick={() => setOpen(false)}>Remove gate</Button></>} />
    </div>
  );
}
