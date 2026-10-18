// The store. Session (me, role, studio, project), UI (theme, screen, selection, filter, notes
// seen, first save filled), and the data the screens read, loaded through the DataSource and
// refreshed on its events. Screens never touch the DataSource for reads; they read here.
import { create } from "zustand";
import type { DataEvent, DataSource } from "@/data/DataSource";
import type { Asset, Comment, Member, Mention, Person, Project, Studio } from "@/data/types";
import type { Stage } from "@/data/mock";
import type { Filter } from "./selectors";
import { applyTheme, setPerson as setThemePerson, setTheme as storeTheme, type Theme, type ThemeChoice } from "./theme";

export type Screen = "zeroStudio" | "zeroProject" | "arrival" | "project" | "asset" | "mentions" | "connections" | "newProject" | "signIn" | "settings" | "projectSettings";

export interface Toast { id: number; text: string; color: string; thumb?: string; go?: () => void }

export interface AppState {
  source: DataSource | null;
  /** The mock stage, for the empty states and the journey. "studio" once real data flows. */
  stage: Stage;
  me: Person | null;
  studio: Studio | null;
  projects: Project[];
  projectId: string | null;
  assets: Asset[];
  members: Member[];
  comments: Record<string, Comment[]>;
  mentions: Mention[];
  /** assetId → saved at, for the pulse and the order. */
  saved: Record<string, number>;
  pulse: string | null;
  theme: Theme;
  themeChoice: ThemeChoice;
  screen: Screen;
  assetId: string | null;
  /** The picked Version on the asset page: a number, "live", or null for the latest. */
  stop: number | "live" | null;
  filter: Filter;
  group: string;
  notesSeen: Record<string, true>;
  firstSaveFilled: boolean;
  toast: Toast | null;
  // actions
  boot(source: DataSource, me: Person, stage: Stage): Promise<void>;
  refresh(): Promise<void>;
  loadComments(assetId: string): Promise<void>;
  go(screen: Screen, extra?: Partial<Pick<AppState, "assetId" | "projectId" | "stop">>): void;
  setFilter(filter: Filter): void;
  setGroup(group: string): void;
  setStop(stop: number | "live" | null): void;
  setTheme(choice: ThemeChoice): void;
  markNoteSeen(key: string): void;
  showToast(text: string, color: string, thumb?: string, go?: () => void): void;
  clearToast(): void;
  onEvent(e: DataEvent): void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let unsubscribe: (() => void) | null = null;

export const useStore = create<AppState>((set, get) => ({
  source: null, stage: "studio", me: null, studio: null, projects: [], projectId: null, assets: [], members: [], comments: {}, mentions: [],
  saved: {}, pulse: null, theme: "light", themeChoice: "light", screen: "project", assetId: null, stop: null, filter: "Everything", group: "All",
  notesSeen: {}, firstSaveFilled: false, toast: null,

  async boot(source, me, stage) {
    unsubscribe?.();
    unsubscribe = source.subscribe((e) => get().onEvent(e));
    const theme = setThemePerson(me.id);
    set({ source, me, stage, theme, saved: {}, pulse: null, filter: "Everything", group: "All", stop: null, notesSeen: {}, firstSaveFilled: stage === "firstsave" || stage === "firstcomment", toast: null });
    await get().refresh();
  },

  async refresh() {
    const { source } = get();
    if (!source) return;
    const [studio, projects] = await Promise.all([source.getStudio(), source.listProjects()]);
    let projectId = get().projectId;
    if (!projectId || !projects.some((p) => p.id === projectId)) projectId = projects.find((p) => !p.sample)?.id ?? projects[0]?.id ?? null;
    const [assets, members, mentions] = projectId ? await Promise.all([source.listAssets(projectId), source.listMembers(projectId), source.listMentions(projectId)]) : [[], [], []];
    set({ studio, projects, projectId, assets, members, mentions });
    const { assetId } = get();
    if (assetId) await get().loadComments(assetId);
  },

  async loadComments(assetId) {
    const { source } = get();
    if (!source) return;
    const list = await source.listComments(assetId);
    set((s) => ({ comments: { ...s.comments, [assetId]: list } }));
  },

  go(screen, extra = {}) {
    set({ screen, stop: null, ...extra });
    const { assetId, projectId } = get();
    if (extra.projectId && extra.projectId !== projectId) void get().refresh();
    if (screen === "asset" && assetId) void get().loadComments(assetId);
  },
  setFilter: (filter) => set({ filter }),
  setGroup: (group) => set({ group }),
  setStop: (stop) => set({ stop }),
  setTheme(choice) { set({ themeChoice: choice, theme: storeTheme(choice) }); },
  markNoteSeen: (key) => set((s) => ({ notesSeen: { ...s.notesSeen, [key]: true } })),

  showToast(text, color, thumb, go) {
    clearTimeout(toastTimer);
    const id = Date.now();
    set({ toast: { id, text, color, ...(thumb ? { thumb } : {}), ...(go ? { go } : {}) } });
    toastTimer = setTimeout(() => { if (get().toast?.id === id) set({ toast: null }); }, 5000);
  },
  clearToast: () => set({ toast: null }),

  onEvent(e) {
    if (e.type === "saved") {
      set((s) => ({ saved: { ...s.saved, [e.assetId]: Date.now() }, pulse: e.assetId, firstSaveFilled: true }));
      setTimeout(() => { if (get().pulse === e.assetId) set({ pulse: null }); }, 1200);
    }
    if (e.type === "published") set({ saved: {} });
    void get().refresh();
  },
}));

/** Keep the document in step with the store's theme on first import. */
applyTheme("light");
