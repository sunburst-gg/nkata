// Boot on live data: the saved session names the server and the token; the account says where
// to land. No token: sign in. No name: the name question. No studio: name the studio. No
// project: start the first one. Else the wall of the saved project, polling events from there.
// The stage on live data is "empty" until the wall has something, "studio" after; an artist
// whose Blender is not yet connected on this computer lands on Arrival first (step 11).
import { useStore, type Screen } from "./store";
import type { LiveDataSource } from "@/data/live/LiveDataSource";
import type { Stage } from "@/data/mock";
import { isArtist } from "@/auth/permissions";
import { readSession, writeSession } from "@/data/live/session";

export async function bootLive(source: LiveDataSource): Promise<void> {
  // Dev builds expose the store and the source to the browser checks, as the mock boot does.
  if (import.meta.env.DEV) Object.assign(window, { __nkataStore: useStore, __nkataLive: source });
  let me = null;
  try { me = await source.loadAccount(); } catch { me = null; }
  if (!me) {
    useStore.setState({ source, me: null, screen: "signIn" });
    return;
  }
  await landLive(source);
}

/** After sign in, a name, a new studio or a new project: where the account stands now. */
export async function landLive(source: LiveDataSource): Promise<void> {
  const me = source.me;
  if (!me) { useStore.setState({ screen: "signIn" }); return; }
  if (!me.name) { useStore.setState({ source, me, screen: "name" }); return; }
  const studio = await source.getStudio();
  if (!studio) { await useStore.getState().boot(source, me, "nostudio"); useStore.setState({ screen: "zeroStudio" }); return; }
  const projects = await source.listProjects();
  if (projects.length === 0) { await useStore.getState().boot(source, me, "noproject"); useStore.setState({ screen: "zeroProject" }); return; }
  const saved = source.savedProjectId();
  const projectId = projects.some((p) => p.id === saved) ? saved : projects[0]!.id;
  const assets = await source.listAssets(projectId);
  const stage: Stage = assets.length === 0 ? "empty" : "studio";
  const firstRun = isArtist(me.role) && source.blender.kind === "disconnected" && !source.blender.version;
  const screen: Screen = firstRun ? "arrival" : "project";
  useStore.setState({ projectId, assetId: null, screen });
  await useStore.getState().boot(source, me, stage);
  useStore.setState({ screen, blender: source.blender });
  source.start(projectId);
  void source.detectBlender().catch(() => undefined);
  const session = readSession();
  if (session) writeSession({ ...session, projectId });
}
