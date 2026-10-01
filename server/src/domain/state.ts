// Part state machine. State is on the part and set only by the server.
// See docs/product.md, Core concepts, and docs/engineering.md, Locks, presence, gates, state.
import type { PartState, Role } from "@nkata/shared";
import { AppError } from "./errors.js";

export type StateAction = "mark_ready" | "send_back" | "approve" | "reopen" | "gate_open";

const REVIEWERS: Role[] = ["art_director", "producer"];

type Rule = { from: PartState[]; to: PartState; roles: Role[] | "owner_or_reviewer" };

const RULES: Record<StateAction, Rule> = {
  mark_ready: { from: ["draft"], to: "ready", roles: "owner_or_reviewer" },
  send_back: { from: ["ready", "approved"], to: "draft", roles: REVIEWERS },
  approve: { from: ["ready"], to: "approved", roles: REVIEWERS },
  reopen: { from: ["approved"], to: "draft", roles: REVIEWERS },
  gate_open: { from: ["locked"], to: "draft", roles: [] },
};

export type Actor = { user_id: string; roles: Role[] };

export function canReview(actor: Actor): boolean {
  return actor.roles.some((r) => REVIEWERS.includes(r));
}

/**
 * Returns the next state, or throws AppError when the transition is not allowed.
 * gate_open is a system action: no actor check.
 */
export function transition(current: PartState, action: StateAction, actor: Actor | null, ownerId: string | null): PartState {
  const rule = RULES[action];
  if (!rule.from.includes(current)) {
    throw new AppError("invalid_state", `cannot ${action.replace("_", " ")} a part in state ${current}`, { from: current, action });
  }
  if (action !== "gate_open") {
    if (!actor) throw new AppError("forbidden", "actor required", { action });
    const allowed =
      rule.roles === "owner_or_reviewer" ? actor.user_id === ownerId || canReview(actor) : actor.roles.some((r) => rule.roles.includes(r));
    if (!allowed) throw new AppError("forbidden", `role cannot ${action.replace("_", " ")}`, { action, roles: actor.roles });
  }
  return rule.to;
}
