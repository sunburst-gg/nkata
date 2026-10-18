// New folder: one name, and the asset moves into it. Folders exist only as the names assets
// carry, so a folder starts with its first asset (docs/tasks/07-blender-first.md, slice 7).
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { CONTROL, Field } from "@/components/Field";
import { cleanFolderName } from "@/lib/list";

export function FolderDialog({ open, onOpenChange, assetName, onMove }: { open: boolean; onOpenChange: (open: boolean) => void; assetName: string; onMove: (folder: string) => void }) {
  const [name, setName] = useState("");
  useEffect(() => { if (open) setName(""); }, [open]);
  const clean = cleanFolderName(name);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New folder" description={`${assetName} moves into it.`}>
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (!clean) return; onMove(clean); onOpenChange(false); }}>
        <Field label="Folder name" hint={`${assetName} moves into it.`}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Market set" aria-label="Folder name" className={CONTROL} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!clean}>Move</Button>
        </div>
      </form>
    </Dialog>
  );
}
