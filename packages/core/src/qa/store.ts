import * as fs from "node:fs";
import { QA_SCHEMA, QaJourney, QaResult, type QaJourneyT, type QaResultT } from "./schema.js";
import { nowIso, readYaml, writeYaml } from "../state/store.js";
import { stewardPaths } from "../state/paths.js";
import { brainPaths } from "../brain/paths.js";
import { Ledger } from "../schema/ledger.js";
import { VERSION } from "../version.js";
import { pathExists } from "../util/fs.js";
import { StateError, validateFeatureId } from "../state/ids.js";
import { freshnessSurface } from "../intel/freshness.js";

/**
 * QA journey store (§26): versioned journeys under .steward/qa/journeys/,
 * results under .steward/qa/results/, artifacts referenced (never embedded)
 * from .steward/qa/artifacts/<feature>/. Freshness (§44/§45) extends the
 * Phase 3 surfaceHash: a journey's surface = its declared surfaces + import
 * graph reach; changing relevant files makes prior results STALE.
 */

const ACTOR = `steward-core@${VERSION}`;
const JOURNEY_ID_RE = /^[A-Za-z][A-Za-z0-9-]{1,79}$/;

export function validateJourneyId(id: string): string {
  if (!JOURNEY_ID_RE.test(id)) {
    throw new StateError(`invalid journey id '${id}': must match [A-Za-z][A-Za-z0-9-]{1,79}`);
  }
  return id;
}

// ─── journeys ────────────────────────────────────────────────────────────

export function readJourney(root: string, journeyId: string): QaJourneyT {
  validateJourneyId(journeyId);
  const p = stewardPaths(root).qaJourneyYaml(journeyId);
  if (!pathExists(p)) {
    throw new StateError(`QA journey '${journeyId}' not found`);
  }
  const parsed = readYaml(p, QaJourney);
  if (!parsed) throw new StateError(`QA journey '${journeyId}' is unreadable`);
  return parsed;
}

export function listJourneys(root: string, featureId?: string): QaJourneyT[] {
  const dir = stewardPaths(root).qaJourneysDir;
  if (!pathExists(dir)) return [];
  const out: QaJourneyT[] = [];
  for (const entry of fs.readdirSync(dir).sort()) {
    if (!entry.endsWith(".yaml")) continue;
    try {
      const j = readYaml(`${dir}/${entry}`, QaJourney);
      if (j && (!featureId || j.featureId === featureId)) out.push(j);
    } catch {
      /* unreadable journey files are skipped; they cannot gate anything */
    }
  }
  return out;
}

export function saveJourney(
  root: string,
  input: Omit<QaJourneyT, "schema" | "createdAt" | "updatedAt"> & { id: string }
): QaJourneyT {
  validateJourneyId(input.id);
  validateFeatureId(input.featureId);
  const existing = (() => {
    try {
      return readJourney(root, input.id);
    } catch {
      return null;
    }
  })();
  const journey: QaJourneyT = {
    ...input,
    schema: QA_SCHEMA,
    createdAt: existing?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  };
  writeYaml(stewardPaths(root).qaJourneyYaml(input.id), journey);
  new Ledger(brainPaths(root).ledgerJsonl).append("qa.journey.created", ACTOR, input.id, {
    featureId: journey.featureId,
    requirements: journey.requirementIds,
    viewports: journey.viewports,
  });
  return journey;
}

// ─── results ─────────────────────────────────────────────────────────────

export function listResults(root: string, journeyId?: string): QaResultT[] {
  const dir = stewardPaths(root).qaResultsDir;
  if (!pathExists(dir)) return [];
  const out: QaResultT[] = [];
  for (const entry of fs.readdirSync(dir).sort()) {
    if (!entry.endsWith(".yaml")) continue;
    try {
      const r = readYaml(`${dir}/${entry}`, QaResult);
      if (r && (!journeyId || r.journeyId === journeyId)) out.push(r);
    } catch {
      /* skip unreadable results */
    }
  }
  return out.sort((a, b) => a.ranAt.localeCompare(b.ranAt));
}

export function latestResult(root: string, journeyId: string): QaResultT | null {
  const all = listResults(root, journeyId);
  return all.length > 0 ? all[all.length - 1] : null;
}

export function saveResult(root: string, result: QaResultT): QaResultT {
  validateJourneyId(result.journeyId);
  validateFeatureId(result.featureId);
  writeYaml(stewardPaths(root).qaResultYaml(result.id), result);
  new Ledger(brainPaths(root).ledgerJsonl).append("qa.journey.recorded", ACTOR, result.journeyId, {
    featureId: result.featureId,
    status: result.status,
    viewports: result.viewports.map((v) => ({ viewport: v.viewport, status: v.status, class: v.failureClass })),
    resultId: result.id,
  });
  return result;
}

/**
 * Build a result from a provider run: stamp the deterministic surface hash
 * (§44) and persist. Artifacts stay on disk; only their names are stored.
 */
export function recordProviderResult(root: string, run: QaResultT, surfaces: string[]): QaResultT {
  const stamp = freshnessSurface(root, run.featureId);
  const withSurfaces = [...surfaces, ...stamp.surfaces].sort();
  const withHash: QaResultT = {
    ...run,
    surfaces: withSurfaces,
    surfaceHash: hashSurface(withSurfaces),
  };
  return saveResult(root, withHash);
}

function hashSurface(surfaces: string[]): string {
  // Cheap deterministic digest (sha256 of joined surfaces, 16 chars).
  // Mirrors intel/freshness but scoped to journey surfaces.
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  return createHash("sha256").update(surfaces.join("\n")).digest("hex").slice(0, 16);
}

// ─── journey-aware freshness (§44, §45) ──────────────────────────────────

export type JourneyFreshness = "CURRENT" | "STALE" | "POTENTIALLY_STALE" | "NO_RESULT" | "UNAVAILABLE";

export interface JourneyFreshnessReport {
  journeyId: string;
  featureId: string;
  freshness: JourneyFreshness;
  detail: string;
}

/**
 * A journey is CURRENT when no relevant file changed since its result was
 * stamped. Relevant = journey.surfaces ∪ freshness surface ∩ changed files,
 * computed by comparing the CURRENT surface hash against the one recorded
 * with the result (selective invalidation, §45 — an unrelated backend change
 * must not invalidate a frontend journey).
 */
export function journeyFreshness(root: string, journey: QaJourneyT): JourneyFreshnessReport {
  const result = latestResult(root, journey.id);
  if (!result) {
    return { journeyId: journey.id, featureId: journey.featureId, freshness: "NO_RESULT", detail: "journey has never run" };
  }
  if (result.status === "UNAVAILABLE") {
    return { journeyId: journey.id, featureId: journey.featureId, freshness: "UNAVAILABLE", detail: result.unavailableReason ?? "provider unavailable at last run" };
  }
  const current = freshnessSurface(root, journey.featureId);
  const journeySurfaces = [...new Set([...journey.surfaces, ...current.surfaces])].sort();
  const currentHash = hashSurface(journeySurfaces);
  if (!result.surfaceHash) {
    return { journeyId: journey.id, featureId: journey.featureId, freshness: "POTENTIALLY_STALE", detail: "result has no surface hash; re-run to confirm" };
  }
  if (result.surfaceHash === currentHash) {
    return { journeyId: journey.id, featureId: journey.featureId, freshness: "CURRENT", detail: `surface unchanged since ${result.ranAt}` };
  }
  return {
    journeyId: journey.id,
    featureId: journey.featureId,
    freshness: "STALE",
    detail: `relevant surfaces changed after ${result.ranAt} (was ${result.surfaceHash}, now ${currentHash})`,
  };
}

export function featureQaStatus(root: string, featureId: string): {
  journeys: JourneyFreshnessReport[];
  blocking: string[];
  required: boolean;
  detail: string;
} {
  validateFeatureId(featureId);
  const journeys = listJourneys(root, featureId);
  const reports = journeys.map((j) => journeyFreshness(root, j));
  const blocking = reports
    .filter((r) => r.freshness === "STALE" || r.freshness === "NO_RESULT" || r.freshness === "UNAVAILABLE")
    .map((r) => `${r.journeyId}: ${r.freshness} — ${r.detail}`);
  return {
    journeys: reports,
    blocking,
    required: journeys.length > 0,
    detail: journeys.length === 0 ? "no journeys declared for this feature" : `${reports.filter((r) => r.freshness === "CURRENT").length}/${reports.length} journey(s) current`,
  };
}
