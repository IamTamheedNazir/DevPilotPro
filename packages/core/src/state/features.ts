import * as fs from "node:fs";
import {
  FeatureConfig,
  type Feature,
  type FeatureState,
} from "./schema.js";
import { StateError, slugifyFeature, validateFeatureId } from "./ids.js";
import { nowIso, readYaml, writeYaml } from "./store.js";
import { brainPaths } from "../brain/paths.js";
import { Ledger } from "../schema/ledger.js";
import { VERSION } from "../version.js";
import { canTransition, requireTransition } from "./machine.js";
import { classifyFeatureRisk, GATE_SECURITY_LEVELS, type RiskClassification } from "../risk.js";
import { readRequirements } from "./requirements.js";
import { listTasks } from "./tasks.js";
import { readSpec } from "./specs.js";
import { readReview } from "./review.js";
import { pathExists } from "../util/fs.js";
import type { GateReport, VerificationVerdict } from "../verification/gates.js";

const ACTOR = `steward-core@${VERSION}`;

function ledger(root: string): Ledger {
  return new Ledger(brainPaths(root).ledgerJsonl);
}

export function featureExists(root: string, featureId: string): boolean {
  return pathExists(
    requireFeaturePath(root, featureId)
  );
}

function requireFeaturePath(root: string, featureId: string): string {
  const { featureYaml } = paths(root);
  return featureYaml(validateFeatureId(featureId));
}

import { stewardPaths, type StewardPaths } from "./paths.js";
function paths(root: string): StewardPaths {
  return stewardPaths(root);
}

export function createFeature(
  root: string,
  opts: { title: string; id?: string; description?: string; request?: string }
): Feature {
  const p = paths(root);
  const id = opts.id ? validateFeatureId(opts.id) : slugifyFeature(opts.title);
  if (featureExists(root, id)) {
    throw new StateError(`feature '${id}' already exists`);
  }
  fs.mkdirSync(p.featureDir(id), { recursive: true });
  const classification = classifyFeatureRisk({ request: opts.request ?? opts.title });
  const feature: Feature = FeatureConfig.parse({
    id,
    title: opts.title,
    state: "PROPOSED",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    risk: classification.level,
    request: opts.request ?? "",
  });
  writeYaml(p.featureYaml(id), feature);
  fs.mkdirSync(p.tasksDir(id), { recursive: true });
  fs.mkdirSync(p.evidenceDir(id), { recursive: true });
  ledger(root).append("feature.created", ACTOR, id, {
    title: feature.title,
    risk: feature.risk,
    signals: classification.signals,
  });
  return feature;
}

export function getFeature(root: string, featureId: string): Feature {
  const file = requireFeaturePath(root, featureId);
  const feature = readYaml(file, FeatureConfig);
  if (!feature) {
    throw new StateError(`feature '${featureId}' not found at ${file}`);
  }
  return feature;
}

export function listFeatures(root: string): Feature[] {
  const p = paths(root);
  if (!pathExists(p.featuresDir)) return [];
  const out: Feature[] = [];
  for (const entry of fs.readdirSync(p.featuresDir).sort()) {
    const file = p.featureYaml(entry);
    if (!pathExists(file)) continue;
    const feature = readYaml(file, FeatureConfig);
    if (feature) out.push(feature);
  }
  return out;
}

function persist(root: string, feature: Feature): void {
  const p = paths(root);
  writeYaml(p.featureYaml(feature.id), { ...feature, updatedAt: nowIso() });
}

export interface TransitionOutcome {
  feature: Feature;
  gates?: GateReport[];
  verdict?: VerificationVerdict;
  blocked?: boolean;
}

/**
 * Apply a lifecycle transition. VERIFYING → COMPLETE is refused unless the
 * Definition-of-Done engine reports every required gate as passing — this is
 * the deterministic completion boundary agents cannot talk their way past.
 */
export function transitionFeature(
  root: string,
  featureId: string,
  to: FeatureState,
  opts: { gates?: () => GateReport[] } = {}
): TransitionOutcome {
  const feature = getFeature(root, featureId);
  requireTransition(feature.state, to);

  if (to === "COMPLETE") {
    if (!opts.gates) {
      throw new StateError(
        "transition to COMPLETE requires a Definition-of-Done evaluation; run 'steward verify' first"
      );
    }
    const gates = opts.gates();
    const verdict = verdictOf(gates);
    if (verdict.verdict !== "COMPLETE_ELIGIBLE") {
      return { feature, gates, verdict, blocked: true };
    }
  }

  const from = feature.state;
  feature.state = to;
  persist(root, feature);
  ledger(root).append("feature.state", ACTOR, featureId, { from, to });
  return { feature };
}

export function verdictOf(gates: GateReport[]): VerificationVerdict {
  const blocking = gates.filter((g) => g.status === "FAIL" || g.status === "MISSING");
  return {
    verdict: blocking.length === 0 ? "COMPLETE_ELIGIBLE" : "NOT_COMPLETE",
    remainingGates: blocking.map((g) => `${g.title}: ${g.status} — ${g.detail}`),
  };
}

/** Recompute the deterministic risk classification and persist it as a floor. */
export function refreshRisk(root: string, featureId: string): RiskClassification & { feature: Feature } {
  const feature = getFeature(root, featureId);
  const requirements = readRequirements(root, featureId)?.requirements ?? [];
  const tasks = listTasks(root, featureId);
  const spec = readSpec(root, featureId);
  const classification = classifyFeatureRisk({
    request: feature.request,
    spec,
    requirements,
    tasks,
  });
  feature.risk = classification.level;
  feature.requiredGates = requiredGatesFor(classification);
  persist(root, feature);
  return { ...classification, feature };
}

export function requiredGatesFor(c: RiskClassification): Array<
  "test" | "typecheck" | "lint" | "build" | "browserQA" | "securityReview"
> {
  const gates: Array<"browserQA" | "securityReview"> = [];
  if (c.requiresBrowserQA) gates.push("browserQA");
  if (GATE_SECURITY_LEVELS.includes(c.level) || c.requiresSecurityReview) gates.push("securityReview");
  return gates;
}

export { canTransition };

/** Review findings reader lives here to avoid a cycle with review.ts. */
function readReviewForGates(root: string, featureId: string) {
  return readReview(root, featureId);
}
export { readReviewForGates };
