// Every screen reads and writes through this interface. The mock implements it first (steps 2 to
// 10); the live source over the agent and the server replaces it in step 11. Reads are async.
// Changes arrive as events, so the app reacts to a real save the same way it reacts to a
// simulated one.
import type { Asset, BlenderInstall, Budgets, Comment, DeletedProject, Journey, LocalProject, Member, Mention, Person, Project, Role, Studio, StudioRef } from "./types";
import type { ConnectionEvent } from "@/app/connection";

export type DataEvent =
  | { type: "saved"; assetId: string; by: string }
  | { type: "published"; assetId: string; version: number }
  | { type: "approved"; assetId: string; version: number }
  | { type: "changesRequested"; assetId: string; version: number }
  | { type: "commented"; assetId: string; commentId: string }
  | { type: "memberChanged"; personId: string; journey: Journey }
  | { type: "presence"; personId: string; file: string | null }
  /** First run: the project row of the setup list is done. Blender rows come from the connection events. */
  | { type: "setup"; step: "project"; meta: string }
  /** The Blender connection (step 9): the machine in app/connection.ts moves on these alone. */
  | ConnectionEvent
  /** Nkata itself: the background process, and the network. */
  | { type: "agent"; running: boolean }
  | { type: "online"; online: boolean }
  | { type: "localChanged" };

export type Unsubscribe = () => void;

export interface DataSource {
  subscribe(handler: (e: DataEvent) => void): Unsubscribe;
  getStudio(): Promise<Studio | null>;
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  listAssets(projectId: string): Promise<Asset[]>;
  getAsset(id: string): Promise<Asset | null>;
  listComments(assetId: string): Promise<Comment[]>;
  listMentions(projectId: string): Promise<Mention[]>;
  listMembers(projectId: string): Promise<Member[]>;
  invite(projectId: string, email: string, role: Role): Promise<Member>;
  /** Publish the latest save as a Version with its note. The checks must all pass. */
  publish(assetId: string, note: string, noteEngineering?: string): Promise<void>;
  approve(assetId: string, version: number): Promise<void>;
  requestChanges(assetId: string, version: number): Promise<void>;
  comment(assetId: string, text: string, pin?: [number, number, number]): Promise<Comment>;
  /** Where this project lives on this computer, or null before the person chose a place. */
  projectFolder(projectId: string): string | null;
  /** Put the project on this computer at that place (a leading ~ is home) and start keeping it in step. */
  placeProject(projectId: string, folder: string): Promise<void>;
  /** Mark a pin done, or reopen it (done false). The author, the asset's owner or a lead may. */
  resolveComment(assetId: string, commentId: string, done: boolean): Promise<void>;
  /** Applies the one-line fix of a failed check on the latest save. */
  fixCheck(assetId: string, key: "textures" | "scale" | "uv" | "tris"): Promise<void>;
  createStudio(name: string): Promise<Studio>;
  createProject(name: string, color: string): Promise<Project>;
  setTraining(on: boolean): Promise<void>;
  // Account and studio (step 8). Sign in: a code by email, then the account.
  requestCode(email: string): Promise<{ sent: true; code?: string }>;
  redeemCode(email: string, code: string): Promise<Person>;
  signOut(): Promise<void>;
  setMe(name: string): Promise<Person>;
  listStudios(): Promise<StudioRef[]>;
  switchStudio(id: string): Promise<void>;
  setStudioName(name: string): Promise<void>;
  listStudioMembers(): Promise<Member[]>;
  setMemberRole(personId: string, role: Role): Promise<void>;
  removeMember(personId: string): Promise<void>;
  renameProject(id: string, name: string): Promise<void>;
  setProjectColor(id: string, color: string): Promise<void>;
  deleteProject(id: string): Promise<void>;
  listDeletedProjects(): Promise<DeletedProject[]>;
  restoreProject(id: string): Promise<void>;
  getBudgets(projectId: string): Promise<Budgets>;
  /** Saves and re-runs the checks on every asset; resolves to how many are over now. */
  setBudgets(projectId: string, budgets: Budgets): Promise<number>;
  setAssetBudget(assetId: string, n: number | null): Promise<void>;
  openInBlender(assetId: string, version?: number): Promise<void>;
  // ---- connections (step 9)
  /** Installs and enables the add-on in the found Blender, then emits addonInstalled. */
  connectBlender(): Promise<void>;
  updateAddon(): Promise<void>;
  /** Opens the app picker; emits toolDetected with the pick, or with several to choose from. */
  pickBlender(install?: BlenderInstall): Promise<void>;
  /** Reloads the add-on after a lost heartbeat. */
  reconnectBlender(): Promise<void>;
  openBlender(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  disconnect(): Promise<void>;
  listLocalProjects(): Promise<LocalProject[]>;
  showInFinder(projectId: string): Promise<void>;
  /** Picks a new place and moves the files; resolves to the new path. */
  moveProject(projectId: string): Promise<string>;
  stopSyncing(projectId: string): Promise<void>;
  syncAgain(projectId: string): Promise<void>;
  restartAgent(): Promise<void>;
  download(assetId: string, format: "glb" | "fbx" | "image", version?: number): Promise<string>;
}
