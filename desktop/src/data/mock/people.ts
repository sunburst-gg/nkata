// The prototype's people. Terracotta, ochre, olive, teal, indigo, plum, rose, slate: one color
// each, as tokens. The person keys (A, C, N, T, E, K, F, D) are the prototype's.
import type { Person, Role } from "../types";

export type Key = "A" | "C" | "N" | "T" | "E" | "K" | "F" | "D";

const make = (key: Key, first: string, last: string, color: string, role: Role, title?: string): Person => ({ id: key, first, name: `${first} ${last}`, initial: key, color, role, ...(title ? { title } : {}) });

export const PEOPLE: Record<Key, Person> = {
  A: make("A", "Ada", "Okafor", "var(--p-terracotta)", "artist"),
  C: make("C", "Chidi", "Eze", "var(--p-ochre)", "artist"),
  N: make("N", "Ngozi", "Umeh", "var(--p-olive)", "artist"),
  T: make("T", "Tobe", "Nwosu", "var(--p-teal)", "artist"),
  E: make("E", "Emeka", "Nnamdi", "var(--p-indigo)", "producer"),
  K: make("K", "Kemi", "Adeyemi", "var(--p-plum)", "artist"),
  F: make("F", "Funmi", "Adebayo", "var(--p-rose)", "viewer"),
  D: make("D", "Dayo", "Bello", "var(--p-slate)", "artist", "Tech artist"),
};

/** Who "me" is per Tweak role. The prototype's lead is Emeka; the app knows him as a producer. */
export const ME: Record<"lead" | "artDirector" | "artist" | "viewer", Person> = {
  lead: PEOPLE.E,
  artDirector: { ...PEOPLE.K, role: "artDirector" },
  artist: PEOPLE.A,
  viewer: PEOPLE.F,
};

export const isLead = (role: Role): boolean => role === "producer" || role === "artDirector";
