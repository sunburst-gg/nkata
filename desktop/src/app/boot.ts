// Picks the DataSource and boots the store. The mock in dev with the Tweaks (and in tests); the
// live source arrives in step 11. The Tweaks' startScreen lands the store on the right screen the
// way the prototype's sync() does.
import { MockDataSource, RISING_SUN, TRY_NKATA, type Stage, type TweakRole } from "@/data/mock";
import { slug } from "@/data/rules";
import { useStore, type Screen } from "./store";
import type { StartScreen, Tweaks } from "@/dev/tweaks";

export function startScreenFor(stage: Stage, role: TweakRole, want: StartScreen): { screen: Screen; projectId: string; assetId: string | null } {
  let screen: Screen = "project";
  let projectId = RISING_SUN.id;
  let assetId: string | null = null;
  if (stage === "nostudio") screen = "zeroStudio";
  if (stage === "noproject") screen = "zeroProject";
  if (stage === "arrival") screen = role === "lead" || role === "artDirector" ? "project" : "arrival";
  if (role === "viewer" && stage === "arrival") assetId = `${TRY_NKATA.id}/${slug("Market stall")}`;
  if (want === "asset" || stage === "firstcomment") { screen = "asset"; assetId = `${RISING_SUN.id}/${slug(stage === "studio" ? "Radio" : "Market lantern")}`; }
  if (want === "mentions") screen = "mentions";
  if (want === "connections") screen = "connections";
  if (want === "sample") { screen = "asset"; projectId = TRY_NKATA.id; assetId = `${TRY_NKATA.id}/${slug("Market stall")}`; }
  return { screen, projectId, assetId };
}

let mock: MockDataSource | null = null;

export async function bootMock(t: Tweaks): Promise<MockDataSource> {
  mock ??= new MockDataSource();
  mock.seed(t.stage, t.role);
  const land = startScreenFor(t.stage, t.role, t.startScreen);
  useStore.setState({ projectId: land.projectId, assetId: land.assetId, screen: land.screen });
  await useStore.getState().boot(mock, mock.me, t.stage);
  useStore.getState().setTheme(t.theme);
  // The mock and the store, for the browser checks and the shots harness (dev only).
  if (import.meta.env.DEV) Object.assign(window, { __nkataMock: mock, __nkataStore: useStore });
  return mock;
}
