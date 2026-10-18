import { useStore } from "@/app/store";
import { can, type Action } from "./permissions";

/** The one gate, as a hook. No role check lives in a component. */
export function useCan(action: Action): boolean {
  const role = useStore((s) => s.me?.role ?? "viewer");
  return can(action, role);
}
