import * as fs from "node:fs";
import { pathExists } from "../util/fs.js";
import { nowIso } from "../state/store.js";
import { StateError, validateFeatureId } from "../state/ids.js";
import { getFeature } from "../state/features.js";
import { readQaPolicy } from "../security/policy.js";
import { sanitizeText } from "../security/redact.js";
import { PlaywrightQaProvider, checkPlaywrightCapability, hasAxeIntegration, playwrightProjectConfig } from "./playwright.js";
import { listJourneys, latestResult, saveResult, validateJourneyId, readJourney } from "./store.js";
import type { QaExecutionContext, QaJourneyT, QaRunResult, QaResultT } from "./schema.js";

/**
 * QA orchestration (§28, §38–§41, §54). Builds the execution context from
 * project policy (target safety), runs journeys through the provider
 * interface, and persists results with surfaceHash freshness stamps.
 * Guardian and the CLI see only this module — never Playwright internals.
 */

export function qaExecutionContext(root: string): QaExecutionContext {
  const policy = readQaPolicy(root);
  return {
    baseUrl: policy.baseUrl,
    allowedHosts: policy.allowedHosts.length > 0 ? policy.allowedHosts : ["localhost", "127.0.0.1"],
    trustedExternalOrigins: policy.trustedExternalOrigins,
    allowedPrivateHosts: policy.allowedPrivateHosts,
    viewports: policy.viewports,
  };
}

export interface QaRunSummary {
  results: QaRunResult[];
  status: "PASS" | "FAIL" | "UNAVAILABLE";
  detail: string;
}

export async function runJourneysForFeature(root: string, featureId: string, journeyId?: string): Promise<QaRunSummary> {
  validateFeatureId(featureId);
  const provider = new PlaywrightQaProvider();
  const available = await provider.available();
  const context = qaExecutionContext(root);
  const journeys = listJourneys(root, featureId);
  if (journeyId) {
    validateJourneyId(journeyId);
    const target = journeys.find((j) => j.id === journeyId);
    if (!target) throw new StateError(`journey '${journeyId}' is not declared for feature '${featureId}'`);
    return runOne(root, provider, target, context);
  }
  if (journeys.length === 0) {
    throw new StateError(`no QA journeys declared for feature '${featureId}' — create one with 'steward qa journey'`);
  }
  const results: QaRunResult[] = [];
  for (const j of journeys) {
    const run = await provider.run(j, context);
    results.push(run);
    saveResult(root, { ...run, surfaceHash: undefined, surfaces: [] });
  }
  const failed = results.filter((r) => r.status === "FAIL");
  const unavailable = results.filter((r) => r.status === "UNAVAILABLE");
  const status: QaRunSummary["status"] = unavailable.length > 0 && failed.length === 0 ? "UNAVAILABLE" : failed.length > 0 ? "FAIL" : "PASS";
  return {
    results,
    status,
    detail:
      status === "PASS"
        ? `${results.length} journey(s) passed`
        : status === "UNAVAILABLE"
          ? `browser QA unavailable: ${unavailable[0]?.unavailableReason ?? "unknown"}`
          : `${failed.length} of ${results.length} journey(s) failed`,
  };
}

async function runOne(root: string, provider: PlaywrightQaProvider, journey: QaJourneyT, context: QaExecutionContext): Promise<QaRunSummary> {
  const run = await provider.run(journey, context);
  saveResult(root, { ...run, surfaceHash: undefined, surfaces: [] });
  return {
    results: [run],
    status: run.status,
    detail: run.summary,
  };
}

export async function runSingleJourney(root: string, journeyId: string): Promise<QaRunSummary> {
  validateJourneyId(journeyId);
  const journey = readJourneyForRun(root, journeyId);
  const provider = new PlaywrightQaProvider();
  const context = qaExecutionContext(root);
  const run = await provider.run(journey, context);
  saveResult(root, { ...run, surfaceHash: undefined, surfaces: [] });
  return { results: [run], status: run.status, detail: run.summary };
}

function readJourneyForRun(root: string, journeyId: string): QaJourneyT {
  const dir = ".";
  void dir;
  // readJourney from store.js (id-validated).
  return readJourney(root, journeyId);
}

/** §54: honest capability detection. */
export async function qaCapabilities(root: string): Promise<{
  provider: string;
  available: boolean;
  detail: string;
  projectConfig?: string;
  browsers: Array<{ name: string; available: boolean }>;
  axeIntegration: boolean;
  baseUrl: string;
}> {
  const cap = await checkPlaywrightCapability(root);
  return {
    provider: "playwright",
    available: cap.available,
    detail: cap.detail,
    projectConfig: cap.projectConfig,
    browsers: cap.browsers,
    axeIntegration: hasAxeIntegration(root),
    baseUrl: readQaPolicy(root).baseUrl,
  };
}

export { latestResult, listJourneys };
export type { QaResultT };
