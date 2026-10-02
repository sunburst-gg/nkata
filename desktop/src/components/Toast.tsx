// Toast. bg-raised, border-border, radius-lg, shadow-2, a state dot and one line. Bottom center.
// Radix Toast gives the live region and the swipe; the store holds the queue.
import * as RadixToast from "@radix-ui/react-toast";
import { useStore, type Toast as ToastModel } from "@/store";
import { Button } from "./Button";

export function ToastItem({ toast, onClose }: { toast: ToastModel; onClose?: () => void }) {
  return (
    <RadixToast.Root
      duration={3500}
      onOpenChange={(open) => { if (!open) onClose?.(); }}
      className="flex items-center gap-2.5 whitespace-nowrap rounded-lg border border-border bg-raised px-4 py-3 text-14 text-heading shadow-2 data-[state=open]:nk-panel-in"
    >
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: `var(--state-${toast.tone})` }} />
      <RadixToast.Description>{toast.text}</RadixToast.Description>
      {toast.action ? <RadixToast.Action altText={toast.action.label} asChild><Button size="sm" className="ml-auto" onClick={toast.action.run}>{toast.action.label}</Button></RadixToast.Action> : null}
    </RadixToast.Root>
  );
}

export function Toaster() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <RadixToast.Provider swipeDirection="down" label="Notifications">
      {toasts.map((t) => <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />)}
      <RadixToast.Viewport className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2 outline-none" />
    </RadixToast.Provider>
  );
}
