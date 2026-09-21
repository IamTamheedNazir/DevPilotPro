import { describe, expect, it } from "vitest";
import {
  canTransition,
  requireTransition,
  TRANSITIONS,
} from "../src/state/machine.js";
import { StateError } from "../src/state/ids.js";
import type { FeatureState } from "../src/state/schema.js";

describe("feature state machine", () => {
  it("allows the legal happy path", () => {
    const path: FeatureState[] = [
      "PROPOSED",
      "SPECIFIED",
      "APPROVED",
      "PLANNED",
      "IMPLEMENTING",
      "VERIFYING",
      "COMPLETE",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1]), `${path[i]} → ${path[i + 1]}`).toBe(true);
    }
  });

  it("forbids skipping the lifecycle (PROPOSED → COMPLETE)", () => {
    expect(canTransition("PROPOSED", "COMPLETE")).toBe(false);
    expect(() => requireTransition("PROPOSED", "COMPLETE")).toThrow(StateError);
  });

  it("forbids completing mid-implementation (IMPLEMENTING → COMPLETE)", () => {
    expect(canTransition("IMPLEMENTING", "COMPLETE")).toBe(false);
    expect(() => requireTransition("IMPLEMENTING", "COMPLETE")).toThrow(StateError);
  });

  it("forbids completing before verification (PLANNED → COMPLETE, APPROVED → COMPLETE)", () => {
    expect(canTransition("PLANNED", "COMPLETE")).toBe(false);
    expect(canTransition("APPROVED", "COMPLETE")).toBe(false);
  });

  it("only allows COMPLETE from VERIFYING", () => {
    for (const state of Object.keys(TRANSITIONS) as FeatureState[]) {
      const allowed = TRANSITIONS[state as FeatureState].includes("COMPLETE");
      if (state === "VERIFYING") expect(allowed).toBe(true);
      else expect(allowed, state).toBe(false);
    }
  });

  it("treats REJECTED, CANCELLED and COMPLETE as terminal", () => {
    expect(TRANSITIONS.REJECTED).toEqual([]);
    expect(TRANSITIONS.CANCELLED).toEqual([]);
    expect(TRANSITIONS.COMPLETE).toEqual([]);
  });

  it("supports BLOCKED from active states and returns to them", () => {
    for (const active of ["PLANNED", "IMPLEMENTING", "VERIFYING"] as FeatureState[]) {
      expect(canTransition(active, "BLOCKED")).toBe(true);
    }
    expect(canTransition("BLOCKED", "IMPLEMENTING")).toBe(true);
    expect(canTransition("BLOCKED", "COMPLETE")).toBe(false);
    expect(canTransition("PROPOSED", "BLOCKED")).toBe(false);
  });

  it("allows spec rework (SPECIFIED → PROPOSED)", () => {
    expect(canTransition("SPECIFIED", "PROPOSED")).toBe(true);
  });

  it("every state defines its transitions explicitly", () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual(
      [
        "PROPOSED",
        "SPECIFIED",
        "APPROVED",
        "PLANNED",
        "IMPLEMENTING",
        "VERIFYING",
        "COMPLETE",
        "BLOCKED",
        "REJECTED",
        "CANCELLED",
      ].sort()
    );
  });
});
