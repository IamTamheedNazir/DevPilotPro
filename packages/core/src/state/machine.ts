import type { FeatureState } from "./schema.js";
import { StateError } from "./ids.js";

/**
 * Deterministic feature lifecycle. Allowed transitions are defined here in
 * code — Markdown and agent prose never decide lifecycle state.
 *
 * Active flow:  PROPOSED → SPECIFIED → APPROVED → PLANNED → IMPLEMENTING
 *               → VERIFYING → COMPLETE
 * Side states:  BLOCKED (pausable from active states), REJECTED, CANCELLED
 *               (terminal), COMPLETE (terminal).
 *
 * Note the deliberate absences: PROPOSED → COMPLETE, IMPLEMENTING → COMPLETE
 * and any → COMPLETE except from VERIFYING are not legal transitions at all,
 * and even VERIFYING → COMPLETE is additionally gated by the Definition-of-
 * Done engine (see verification/gates.ts).
 */
export const TRANSITIONS: Readonly<Record<FeatureState, readonly FeatureState[]>> = {
  PROPOSED: ["SPECIFIED", "REJECTED", "CANCELLED"],
  SPECIFIED: ["APPROVED", "PROPOSED", "CANCELLED"],
  APPROVED: ["PLANNED", "CANCELLED"],
  PLANNED: ["IMPLEMENTING", "BLOCKED", "CANCELLED"],
  IMPLEMENTING: ["VERIFYING", "BLOCKED", "CANCELLED"],
  VERIFYING: ["COMPLETE", "IMPLEMENTING", "BLOCKED", "CANCELLED"],
  COMPLETE: [],
  BLOCKED: ["PLANNED", "IMPLEMENTING", "VERIFYING", "CANCELLED"],
  REJECTED: [],
  CANCELLED: [],
};

export const ACTIVE_STATES: readonly FeatureState[] = [
  "PLANNED",
  "IMPLEMENTING",
  "VERIFYING",
];

export function canTransition(from: FeatureState, to: FeatureState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function requireTransition(from: FeatureState, to: FeatureState): void {
  if (!canTransition(from, to)) {
    throw new StateError(
      `illegal feature transition ${from} → ${to}; allowed: ${TRANSITIONS[from].join(", ") || "(none)"}`
    );
  }
}

/** Feature state that best represents the current task activity. */
export function taskDrivenState(tasks: Array<{ status: string }>): "IMPLEMENTING" | "VERIFYING" {
  const allDone = tasks.length > 0 && tasks.every((t) => t.status === "DONE");
  return allDone ? "VERIFYING" : "IMPLEMENTING";
}
