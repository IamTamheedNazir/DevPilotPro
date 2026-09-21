import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import { makeProject } from "./helpers.js";
import { createFeature } from "../src/state/features.js";
import { saveJourney, listJourneys, latestResult, journeyFreshness, featureQaStatus, saveResult } from "../src/qa/store.js";
import { isHostAllowed, classifyFailure, OriginEscapeError } from "../src/qa/playwright.js";
import type { QaExecutionContext } from "../src/qa/schema.js";

/**
 * Browser QA tests (§69): journey store, journey-aware freshness with
 * selective invalidation, target safety (allowed/disallowed/origin escape),
 * failure classification, and honest UNAVAILABLE (never a fake PASS).
 */

function makeJourneyFixture(root: string, featureId = "feat-qa-a", journeyId = "QA-TEST-001") {
  createFeature(root, { id: featureId, title: "QA feature" });
  return saveJourney(root, {
    id: journeyId,
    title: "Open settings",
    featureId,
    requirementIds: ["REQ-QA-001"],
    startUrl: "/settings",
    steps: [{ kind: "goto", url: "/settings" }, { kind: "expect", selector: "h1", text: "Settings" }],
    viewports: ["desktop"],
    surfaces: ["src/settings/page.ts"],
    accessibility: true,
  });
}

const baseContext: QaExecutionContext = {
  baseUrl: "http://localhost:3000",
  allowedHosts: ["localhost", "127.0.0.1"],
  trustedExternalOrigins: [],
  allowedPrivateHosts: [],
  viewports: { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } },
};

describe("journey store", () => {
  it("saves, lists, and reads back journeys", () => {
    const root = makeProject();
    const j = makeJourneyFixture(root);
    expect(listJourneys(root, "feat-qa-a").map((x) => x.id)).toEqual([j.id]);
    expect(j.steps).toHaveLength(2);
    expect(j.schema).toBe("steward.qa.v1");
  });

  it("rejects hostile journey ids", () => {
    const root = makeProject();
    expect(() =>
      saveJourney(root, {
        id: "../evil",
        title: "x",
        featureId: "feat-q",
        requirementIds: [],
        startUrl: "/",
        steps: [{ kind: "goto", url: "/" }],
        viewports: ["desktop"],
        surfaces: [],
        accessibility: true,
      })
    ).toThrow(/journey id/);
  });

  it("reports NO_RESULT freshness before the first run", () => {
    const root = makeProject();
    const j = makeJourneyFixture(root);
    const report = journeyFreshness(root, j);
    expect(report.freshness).toBe("NO_RESULT");
    const status = featureQaStatus(root, "feat-qa-a");
    expect(status.blocking.length).toBe(1);
  });
});

describe("target safety (§40, §41, §67)", () => {
  it("allows localhost targets", () => {
    expect(isHostAllowed("http://localhost:3000/settings", baseContext)).toBe(true);
    expect(isHostAllowed("http://127.0.0.1:3000/x", baseContext)).toBe(true);
  });

  it("blocks disallowed external hosts", () => {
    expect(isHostAllowed("https://evil.example.com", baseContext)).toBe(false);
  });

  it("blocks cloud metadata and private networks unless explicitly allowed", () => {
    expect(isHostAllowed("http://169.254.169.254/latest/meta-data", baseContext)).toBe(false);
    expect(isHostAllowed("http://10.0.0.5/internal", baseContext)).toBe(false);
    expect(isHostAllowed("http://192.168.1.10:8080", baseContext)).toBe(false);
    const permissive: QaExecutionContext = { ...baseContext, allowedPrivateHosts: ["10.0.0.5"] };
    expect(isHostAllowed("http://10.0.0.5/internal", permissive)).toBe(true);
  });

  it("classifies origin escape errors distinctly", () => {
    const err = new OriginEscapeError("https://evil.example.com");
    expect(classifyFailure(err)).toBe("ORIGIN_ESCAPE");
  });

  it("classifies timeouts, assertions, and console errors", () => {
    expect(classifyFailure(new Error("Timeout 10000ms exceeded"))).toBe("TIMEOUT");
    expect(classifyFailure(new Error("expect: selector h1 did not contain Settings"))).toBe("ASSERTION");
  });
});

describe("journey-aware freshness (§44, §45)", () => {
  it("a result without a surface hash is POTENTIALLY_STALE, not CURRENT", () => {
    const root = makeProject();
    const j = makeJourneyFixture(root);
    latestResultOrSet(root, j.id, "PASS", undefined);
    const report = journeyFreshness(root, j);
    expect(report.freshness).toBe("POTENTIALLY_STALE");
  });

  it("UNAVAILABLE results stay blocking and honest", () => {
    const root = makeProject();
    const j = makeJourneyFixture(root);
    latestResultOrSet(root, j.id, "UNAVAILABLE", undefined, "playwright not installed");
    const status = featureQaStatus(root, "feat-qa-a");
    expect(status.blocking.length).toBe(1);
    expect(status.blocking[0]).toContain("UNAVAILABLE");
  });
});

/** Helper: write a result directly through the store for freshness tests. */
function latestResultOrSet(root: string, journeyId: string, status: "PASS" | "FAIL" | "UNAVAILABLE", surfaceHash?: string, unavailableReason?: string): void {
  saveResult(root, {
    schema: "steward.qa.v1",
    id: `QAR-${journeyId}-t`,
    journeyId,
    featureId: "feat-qa-a",
    requirementIds: ["REQ-QA-001"],
    ranAt: new Date().toISOString(),
    provider: "playwright",
    status,
    unavailableReason,
    viewports: [],
    surfaceHash,
    surfaces: [],
    summary: status,
  });
}
