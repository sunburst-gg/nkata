// Approve with pins still open (v8 step 14): one question, then the pins are marked done with
// the approval so the artist's panel and the Addressed fold agree with the decision.
import * as Dialog from "@radix-ui/react-dialog";

const quiet: React.CSSProperties = { height: 36, padding: "0 14px", borderRadius: "var(--r-6)", border: 0, background: "var(--raised)", boxShadow: "var(--shadow)", color: "var(--ink)", font: "500 14px var(--sans)", cursor: "pointer" };

export function ApproveOpenPinsDialog({ open, count, version, onOpenChange, onApprove }: { open: boolean; count: number; version: number; onOpenChange: (o: boolean) => void; onApprove: () => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 40 }} />
        <Dialog.Content aria-describedby={undefined} style={{ position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: 420, background: "var(--raised)", borderRadius: "var(--r-16)", boxShadow: "var(--shadow-lift)", padding: 28, display: "flex", flexDirection: "column", gap: 16, zIndex: 41, outline: "none", animation: "nk-rise var(--t-panel) var(--ease)" }}>
          <Dialog.Title style={{ margin: 0, font: "400 var(--t-28)/1.2 var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)" }}>{count} pin{count === 1 ? "" : "s"} still open. Approve anyway?</Dialog.Title>
          <span style={{ fontSize: 15, color: "var(--ink60)", lineHeight: 1.5 }}>Approving v{version} marks {count === 1 ? "it" : "them"} done. {count === 1 ? "It moves" : "They move"} under Addressed, and the viewport in Blender goes quiet.</span>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => onOpenChange(false)} style={quiet}>Cancel</button>
            <button type="button" onClick={onApprove} style={{ ...quiet, background: "var(--amber)", color: "var(--amber-fg)", boxShadow: "none" }}>Approve anyway</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
