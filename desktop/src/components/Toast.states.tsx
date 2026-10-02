import * as RadixToast from "@radix-ui/react-toast";
import { ToastItem } from "./Toast";

export function ToastStates() {
  return (
    <RadixToast.Provider>
      <div className="flex flex-col items-start gap-2.5">
        <ToastItem toast={{ id: 1, text: "Approved by Emeka. Face is locked.", tone: "approved" }} />
        <ToastItem toast={{ id: 2, text: "Not in Unreal. The editor is closed.", tone: "failed", action: { label: "Retry", run: () => undefined } }} />
        <ToastItem toast={{ id: 3, text: "face is v15, from v12. In Unreal.", tone: "synced" }} />
      </div>
      <RadixToast.Viewport className="hidden" />
    </RadixToast.Provider>
  );
}
