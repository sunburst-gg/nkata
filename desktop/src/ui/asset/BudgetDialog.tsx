// Set a budget for this asset: one triangle number for this model alone, over the project's
// number for its kind. "Use the project budget" clears it. Leads only (can("setBudget")).
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { useStore } from "@/app/store";
import type { Asset } from "@/data/types";
import { toast } from "@/ui/toast/toast";

const field: React.CSSProperties = { height: 44, borderRadius: "var(--r-6)", border: 0, background: "var(--canvas)", padding: "0 14px", font: "400 17px var(--mono)", color: "var(--ink)", outline: "none" };

export function BudgetDialog({ asset, open, onOpenChange }: { asset: Asset; open: boolean; onOpenChange: (o: boolean) => void }) {
  const source = useStore((s) => s.source);
  const refresh = useStore((s) => s.refresh);
  const me = useStore((s) => s.me);
  const [value, setValue] = useState(asset.budget ? String(asset.budget) : "");
  useEffect(() => { if (open) setValue(asset.budget ? String(asset.budget) : ""); }, [open, asset.budget]);
  const n = Number(value.replace(/[^\d]/g, ""));
  const save = async (clear = false) => {
    if (!source || !me) return;
    if (!clear && !(n > 0)) { toast("Enter a number of triangles.", "var(--bad)"); return; }
    await source.setAssetBudget(asset.id, clear ? null : n);
    await refresh();
    onOpenChange(false);
    toast(clear ? `${asset.name} uses the project budget again.` : `Budget ${n.toLocaleString("en-US")} for ${asset.name}.`, me.color);
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 40 }} />
        <Dialog.Content aria-describedby={undefined} style={{ position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: 420, background: "var(--raised)", borderRadius: "var(--r-16)", boxShadow: "var(--shadow-lift)", padding: 28, display: "flex", flexDirection: "column", gap: 20, zIndex: 41, outline: "none", animation: "nk-rise var(--t-panel) var(--ease)" }}>
          <Dialog.Title style={{ margin: 0, font: "400 var(--t-28) var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)" }}>Budget for {asset.name}</Dialog.Title>
          <form onSubmit={(e) => { e.preventDefault(); void save(); }} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <input autoFocus inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} placeholder="45,000" aria-label="Triangles" style={field} />
            <span style={{ fontSize: 13, color: "var(--ink60)" }}>Triangles for this model alone. The project number stays for the rest.</span>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <button type="submit" style={{ height: 44, padding: "0 22px", borderRadius: "var(--r-6)", border: 0, background: "var(--amber)", color: "var(--amber-fg)", font: "500 15px var(--sans)", cursor: "pointer" }}>Save</button>
              {asset.budget ? <button type="button" onClick={() => void save(true)} style={{ border: 0, background: "transparent", padding: 0, font: "400 13px var(--sans)", color: "var(--ink60)", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>Use the project budget</button> : null}
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
