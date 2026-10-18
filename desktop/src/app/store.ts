// The store. Session (me, role, studio, project), UI (theme, screen, selection, filter, notes
// seen, first save filled), and the data the screens read, loaded through the DataSource and
// refreshed on its events. Screens never touch the DataSource for reads; they read here.
import { create } from "zustand";
import type { DataEvent, DataSource } from "@/data/DataSource";
import type { Asset, Comment, Member, Mention, Person, Project, Studio } from "@/data/types";
import type { Stage } from "@/data/mock";
import type { Filter } from "./selectors";
import { apply as applyJourney, type MemberState } from "./journey";
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
  /** The team strip machine, per person, over the roster from the source. */
  journeys: Record<string, Member["journey"]>;
  journeyState: Record<string, MemberState>;
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
  inviteOpen: boolean;
  publishOpen: boolean;
  /** The pin just dropped on the model, waiting for its line. */
  pendingPin: [number, number, number] | null;
  activePin: string | null;
  draft: string;
  compare: boolean;
  /** The older Version picked for Compare. */
  compareWith: number | null;
  stamp: boolean;
  /** Arrival setup rows done, in order. */
  setupDone: string[];
  /** The sidebar slides in once, after the zero state. */
  slideIn: boolean;
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
  source: null, stage: "studio", me: null, studio: null, projects: [], projectId: null, assets: [], members: [], journeys: {}, journeyState: {}, comments: {}, mentions: [],
  saved: {}, pulse: null, theme: "light", themeChoice: "light", screen: "project", assetId: null, stop: null, filter: "Everything", group: "All",
  notesSeen: {}, firstSaveFilled: false, toast: null, inviteOpen: false, publishOpen: false,
  pendingPin: null, activePin: null, draft: "", compare: false, compareWith: null, stamp: false, setupDone: [], slideIn: false,

  async boot(source, me, stage) {
    unsubscribe?.();
    unsubscribe = source.subscribe((e) => get().onEvent(e));
    const theme = setThemePerson(me.id);
    set({ source, me, stage, theme, saved: {}, pulse: null, filter: "Everything", group: "All", stop: null, notesSeen: readNotes(me.id), firstSaveFilled: stage === "firstsave" || stage === "firstcomment", toast: null, journeys: {}, journeyState: {}, setupDone: [], slideIn: false });
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
    const was = get().projectId;
    set({ screen, stop: null, pendingPin: null, activePin: null, draft: "", compare: false, compareWith: null, ...extra });
    const { assetId } = get();
    if (extra.projectId && extra.projectId !== was) void get().refresh();
    if (screen === "asset" && assetId) void get().loadComments(assetId);
  },
  setFilter: (filter) => set({ filter }),
  setGroup: (group) => set({ group }),
  setStop: (stop) => set((s) => (s.compare && typeof stop === "number" && stop !== (s.assets.find((a) => a.id === s.assetId)?.versions[0]?.n ?? 0) ? { compareWith: stop } : { stop })),
  setTheme(choice) { set({ themeChoice: choice, theme: storeTheme(choice) }); },
  markNoteSeen: (key) => set((s) => { const notesSeen: Record<string, true> = { ...s.notesSeen, [key]: true as const }; writeNotes(s.me?.id ?? "anon", notesSeen); return { notesSeen }; }),

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
      void get().refresh().then(() => {
        const { assets, members, me } = get();
        const asset = assets.find((a) => a.id === e.assetId);
        if (!asset) return;
        const who = e.by === me?.id ? "You" : (members.find((m) => m.person.id === e.by)?.person.first ?? asset.owner.first);
        get().showToast(`${who} saved ${asset.name}.`, asset.owner.color, asset.render ?? "/fixtures/renders/compound-ground.png", () => get().go("asset", { assetId: asset.id }));
      });
      return;
    }
    if (e.type === "setup") { set((s) => ({ setupDone: s.setupDone.includes(e.step) ? s.setupDone : [...s.setupDone, e.step] })); return; }
    if (e.type === "memberChanged" || e.type === "presence") {
      const now = Date.now();
      set((s) => {
        const prev = s.journeyState[e.personId] ?? { journey: s.members.find((m) => m.person.id === e.personId)?.journey ?? "invited", lastBeat: null };
        const next = applyJourney(prev, e.type === "memberChanged" ? { type: "memberChanged", journey: e.journey } : { type: "presence", file: e.file }, now);
        return { journeyState: { ...s.journeyState, [e.personId]: next }, journeys: { ...s.journeys, [e.personId]: next.journey } };
      });
    }
    // A published or decided asset moves to the top of the wall, without the saved pulse.
    if (e.type === "published" || e.type === "approved" || e.type === "changesRequested") set((s) => ({ saved: { ...(e.type === "published" ? {} : s.saved), [e.assetId]: Date.now() } }));
    void get().refresh();
  },
}));

/** First-time notes, dismissed once per person per idea, kept per person. */
function readNotes(person: string): Record<string, true> {
  try { const v = localStorage.getItem(`nkata.notes.${person}`); return v ? (JSON.parse(v) as Record<string, true>) : {}; } catch { return {}; }
}
function writeNotes(person: string, notes: Record<string, true>): void {
  try { localStorage.setItem(`nkata.notes.${person}`, JSON.stringify(notes)); } catch { /* private mode: lasts the session */ }
}

/** Keep the document in step with the store's theme on first import. */
applyTheme("light");
