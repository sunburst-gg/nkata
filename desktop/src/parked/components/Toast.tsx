// Toast, v3: one dark line at the bottom center with a check in a state colored circle. Inverted
// against the theme, so it reads on both. Radix Toast gives the live region; the store holds the queue.
import * as RadixToast from "@radix-ui/react-toast";
import { Check } from "lucide-react";
import { useStore, type Toast as ToastModel } from "@/store";
import { Button } from "./Button";
import { stateColor } from "@/lib/state";

export function ToastItem({ toast, onClose }: { toast: ToastModel; onClose?: () => void }) {
  return (
    <RadixToast.Root
      duration={3200}
      onOpenChange={(open) => { if (!open) onClose?.(); }}
      className="flex items-center gap-2.5 whitespace-nowrap rounded-[10px] bg-heading py-2.5 pl-3 pr-3.5 text-14 text-canvas shadow-modal data-[state=open]:nk-panel-in"
    >
      <span aria-hidden="true" className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-canvas" style={{ background: stateColor(toast.tone) }}>
        <Check size={10} strokeWidth={2.5} />
      </span>
      <RadixToast.Description>{toast.text}</RadixToast.Description>
      {toast.action ? <RadixToast.Action altText={toast.action.label} asChild><Button size="sm" variant="inverted" className="ml-2 bg-canvas text-heading" onClick={toast.action.run}>{toast.action.label}</Button></RadixToast.Action> : null}
    </RadixToast.Root>
  );
}

export function Toaster() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <RadixToast.Provider swipeDirection="down" label="Notifications">
      {toasts.map((t) => <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />)}
      <RadixToast.Viewport className="fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2 outline-none" />
    </RadixToast.Provider>
  );
}
