// Radix opens a dropdown on pointerdown, and on Enter or Space at keydown, where it also prevents
// the click. An assistive press (VoiceOver, Switch Control, automation) sends a click with
// neither, so every menu stayed shut for it. A click with detail 0 is that press: a mouse click
// counts 1 or more, and the keyboard's click never fires. These two wrap Menu.Root and
// Menu.Trigger and open on that press too.
// https://www.radix-ui.com/primitives/docs/components/dropdown-menu
// https://developer.mozilla.org/en-US/docs/Web/API/UIEvent/detail
import * as Menu from "@radix-ui/react-dropdown-menu";
import { createContext, useContext, useState, type ReactNode } from "react";

const Toggle = createContext<() => void>(() => undefined);

/** True for a click no pointer or key opened the menu for: an assistive press. */
export const isAssistivePress = (detail: number): boolean => detail === 0;

export function MenuRoot({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Toggle.Provider value={() => setOpen((o) => !o)}>
      <Menu.Root open={open} onOpenChange={setOpen}>{children}</Menu.Root>
    </Toggle.Provider>
  );
}

export function MenuTrigger({ children }: { children: ReactNode }) {
  const toggle = useContext(Toggle);
  return <Menu.Trigger asChild onClick={(e) => { if (isAssistivePress(e.detail)) toggle(); }}>{children}</Menu.Trigger>;
}
