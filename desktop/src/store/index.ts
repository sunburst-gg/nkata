// Zustand store. The data lives in the DataSource; the store holds its snapshot and the UI state.
// https://zustand.docs.pmnd.rs/
import { useCallback, useSyncExternalStore } from "react";
import { createStore as createVanilla, type StoreApi } from "zustand/vanilla";
import type { Role } from "@/auth/permissions";
import { can, type Action } from "@/auth/permissions";
import { createMockSource } from "@/data/mock";
import type { AssetKind, DataSource, Snapshot } from "@/data/types";

export type Theme = "dark" | "light";
const THEME_KEY = "nkata.theme";

export function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage can be blocked. The theme still applies for this session.
  }
}

export interface Toast {
  id: number;
  text: string;
  /** A state token name, for the dot. */
  tone: "approved" | "ready" | "failed" | "synced" | "draft" | "locked";
  action?: { label: string; run: () => void };
}

interface UiState {
  railOpen: boolean;
  reviewMode: boolean;
  tab: "All" | AssetKind;
  theme: Theme;
  toasts: Toast[];
  inviteOpen: boolean;
  signedIn: boolean;
}

interface Store extends UiState {
  source: DataSource;
  db: Snapshot;
  role: Role;
  can: (action: Action) => boolean;
  refresh: () => void;
  setRail: (open: boolean) => void;
  setReview: (on: boolean) => void;
  setTab: (tab: UiState["tab"]) => void;
  setTheme: (theme: Theme) => void;
  toast: (text: string, tone: Toast["tone"], action?: Toast["action"]) => void;
  dismissToast: (id: number) => void;
  setInvite: (open: boolean) => void;
  signIn: (as: "artist" | "viewer") => void;
  signOut: () => void;
  switchRole: (as: "artist" | "viewer") => void;
}

let toastSeq = 0;

export function createStore(source: DataSource = createMockSource()): StoreApi<Store> {
  const store = createVanilla<Store>((set, get) => ({
    source,
    db: source.snapshot(),
    role: source.snapshot().session.user.role,
    railOpen: false,
    reviewMode: false,
    tab: "All",
    theme: readStoredTheme(),
    toasts: [],
    inviteOpen: false,
    signedIn: false,
    can: (action) => can(action, get().role),
    refresh: () => {
      const db = get().source.snapshot();
      set({ db, role: db.session.user.role });
    },
    setRail: (railOpen) => set({ railOpen }),
    setReview: (reviewMode) => set({ reviewMode, tab: reviewMode ? "All" : get().tab }),
    setTab: (tab) => set({ tab }),
    setTheme: (theme) => {
      applyTheme(theme);
      get().source.setTheme(theme);
      set({ theme });
    },
    toast: (text, tone, action) => {
      const id = ++toastSeq;
      set({ toasts: [...get().toasts.slice(-2), action ? { id, text, tone, action } : { id, text, tone }] });
      setTimeout(() => get().dismissToast(id), 3500);
    },
    dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
    setInvite: (inviteOpen) => set({ inviteOpen }),
    signIn: (as) => {
      get().source.signIn(as);
      set({ signedIn: true, railOpen: false, reviewMode: false });
      get().refresh();
    },
    signOut: () => {
      get().source.signOut();
      set({ signedIn: false, railOpen: false, reviewMode: false, inviteOpen: false });
    },
    switchRole: (as) => {
      get().source.signIn(as);
      get().refresh();
    },
  }));
  source.subscribe(() => store.getState().refresh());
  return store;
}

const api = createStore();

/**
 * Reads the store. The server snapshot is the live state too, so a server render (the viewer test)
 * sees the current role. A desktop app never hydrates server markup.
 */
export function useStore<T>(selector: (state: Store) => T): T {
  return useSyncExternalStore(api.subscribe, () => selector(api.getState()), () => selector(api.getState()));
}
/** can() bound to the current role. Re-renders when the role changes. */
export function useCan(): (action: Action) => boolean {
  const role = useStore((s) => s.role);
  return useCallback((action: Action) => can(action, role), [role]);
}

useStore.getState = api.getState;
useStore.setState = api.setState;
useStore.subscribe = api.subscribe;
