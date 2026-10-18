// Every screen reads and writes through this interface. The mock implements it first (steps 2 to
// 10); the live source over the agent and the server replaces it in step 11. Reads are async.
// Changes arrive as events, so the app reacts to a real save the same way it reacts to a
// simulated one.
import type { Asset, Budgets, Comment, DeletedProject, Journey, Member, Mention, Person, Project, Role, Studio, StudioRef } from "./types";

export type DataEvent =
  | { type: "saved"; assetId: string; by: string }
  | { type: "published"; assetId: string; version: number }
  | { type: "approved"; assetId: string; version: number }
  | { type: "changesRequested"; assetId: string; version: number }
  | { type: "commented"; assetId: string; commentId: string }
  | { type: "memberChanged"; personId: string; journey: Journey }
  | { type: "presence"; personId: string; file: string | null }
  /** First run: one row of the setup list is done (step 9 folds this into the Blender states). */
  | { type: "setup"; step: "blender" | "addon" | "project"; meta: string };

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
  download(assetId: string, format: "glb" | "fbx" | "image", version?: number): Promise<string>;
}
