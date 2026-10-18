// The team strip state machine. States per member: invited, joined, blender, inBlender, in that
// order. Moves come only from DataSource events (memberChanged, presence) and never go backward,
// with one exception: inBlender falls back to blender after 60 s without a presence beat.
import type { Journey } from "@/data/types";

export const ORDER: readonly Journey[] = ["invited", "joined", "blender", "inBlender"];
export const BEAT_TIMEOUT_MS = 60_000;

export interface MemberState { journey: Journey; lastBeat: number | null }

export const rank = (j: Journey): number => ORDER.indexOf(j);

/** The later of two states. A member never moves backward on an event. */
export function forward(current: Journey, next: Journey): Journey {
  return rank(next) > rank(current) ? next : current;
}

export type JourneyEvent = { type: "memberChanged"; journey: Journey } | { type: "presence"; file: string | null };

/** Applies one event at time `now`. A beat with a file means In Blender; a beat without one means Blender. */
export function apply(state: MemberState, event: JourneyEvent, now: number): MemberState {
  if (event.type === "memberChanged") return { journey: forward(state.journey, event.journey), lastBeat: state.lastBeat };
  if (event.file) return { journey: "inBlender", lastBeat: now };
  return { journey: forward(state.journey, "blender"), lastBeat: null };
}

/** The timeout: In Blender without a beat for 60 s reads as Blender. The only backward move. */
export function settle(state: MemberState, now: number): MemberState {
  if (state.journey === "inBlender" && state.lastBeat !== null && now - state.lastBeat >= BEAT_TIMEOUT_MS) return { journey: "blender", lastBeat: null };
  return state;
}

/** The roster's journey and the machine's: the further one, after the timeout. */
export function merge(roster: Journey, machine: MemberState | undefined, now: number): Journey {
  if (!machine) return roster;
  const settled = settle(machine, now);
  // A roster that says inBlender is a fresh beat the machine has not seen yet.
  if (roster === "inBlender" && settled.journey !== "inBlender") return machine.lastBeat === null ? "inBlender" : settled.journey;
  return forward(roster, settled.journey);
}
