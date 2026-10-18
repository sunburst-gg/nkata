// Disconnect Blender: a small dialog. Disconnect is not amber; it is not the primary action of
// the screen. After: a toast, and the Team strip shows me as Joined.
import * as Dialog from "@radix-ui/react-dialog";
import { useStore } from "@/app/store";
import { toast } from "@/ui/toast/toast";

const quiet: React.CSSProperties = { height: 36, padding: "0 14px", borderRadius: "var(--r-6)", border: 0, background: "var(--raised)", boxShadow: "var(--shadow)", color: "var(--ink)", font: "500 14px var(--sans)", cursor: "pointer" };

export function DisconnectDialog() {
  const open = useStore((s) => s.disconnectOpen);
  const source = useStore((s) => s.source);
  const me = useStore((s) => s.me);
  const refresh = useStore((s) => s.refresh);
  const close = () => useStore.setState({ disconnectOpen: false });
  const disconnect = async () => {
    if (!source || !me) return;
    await source.disconnect();
    close();
    await refresh();
    toast("Blender disconnected. Your files stay where they are.", me.color);
  };
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 40 }} />
        <Dialog.Content aria-describedby={undefined} style={{ position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: 420, background: "var(--raised)", borderRadius: "var(--r-16)", boxShadow: "var(--shadow-lift)", padding: 28, display: "flex", flexDirection: "column", gap: 16, zIndex: 41, outline: "none", animation: "nk-rise var(--t-panel) var(--ease)" }}>
          <Dialog.Title style={{ margin: 0, font: "400 var(--t-28)/1.2 var(--serif)", letterSpacing: "-0.02em", color: "var(--ink)" }}>Disconnect Blender?</Dialog.Title>
          <span style={{ fontSize: 15, color: "var(--ink60)", lineHeight: 1.5 }}>The add-on is removed. Your files stay where they are. Your team keeps everything you published.</span>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={close} style={quiet}>Cancel</button>
            <button type="button" onClick={() => void disconnect()} style={{ ...quiet, color: "var(--bad)" }}>Disconnect</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
