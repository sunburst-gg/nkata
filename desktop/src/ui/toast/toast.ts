// One toast at a time: a dark pill, bottom left above the sidebar edge. Click runs its action,
// gone after 5 s. Screens call toast(); the Toaster draws whatever the store holds.
import { useStore } from "@/app/store";

export function toast(text: string, color: string, options: { thumb?: string; go?: () => void } = {}): void {
  useStore.getState().showToast(text, color, options.thumb, options.go);
}
