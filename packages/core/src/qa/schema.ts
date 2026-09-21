import { z } from "zod";

/**
 * Browser QA schemas — versioned steward.qa.v1. Journeys are small,
 * versioned metadata; results carry sanitized, bounded evidence. The
 * provider interface is below; Guardian never knows Playwright internals.
 */

export const QA_SCHEMA = "steward.qa.v1";

export const QA_STEP_KINDS = ["goto", "click", "fill", "press", "wait", "expect", "screenshot", "checkAccessibility", "saveState"] as const;
export type QaStepKind = (typeof QA_STEP_KINDS)[number];

export const QaStep = z.object({
  kind: z.enum(QA_STEP_KINDS),
  /** goto: url; click: selector; fill: selector+value; press: key; expect: selector+text */
  selector: z.string().max(300).optional(),
  value: z.string().max(300).optional(),
  text: z.string().max(600).optional(),
  url: z.string().max(600).optional(),
  /** expect: failure message if assertion fails */
  description: z.string().max(300).optional(),
  /** viewport for this step's journey leg */
  viewport: z.enum(["desktop", "mobile"]).optional(),
  timeoutMs: z.number().int().min(100).max(120_000).optional(),
});
export type QaStepT = z.infer<typeof QaStep>;

export const QaJourney = z.object({
  schema: z.literal(QA_SCHEMA).default(QA_SCHEMA),
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(300),
  featureId: z.string().min(1),
  requirementIds: z.array(z.string()).default([]),
  /** Start path — combined with policy baseUrl. */
  startUrl: z.string().min(1).max(600),
  steps: z.array(QaStep).min(1),
  /** Which viewports this journey must run in ("both" = desktop + mobile). */
  viewports: z.array(z.enum(["desktop", "mobile"])).default(["desktop"]),
  /** Files whose change invalidates this journey (extra to import graph). */
  surfaces: z.array(z.string()).default([]),
  /** Reference to a native project Playwright spec (do not duplicate tests). */
  playwrightSpec: z.string().optional(),
  /** Whether to run automated accessibility checks (per policy default). */
  accessibility: z.boolean().default(true),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type QaJourneyT = z.infer<typeof QaJourney>;

export const QA_FAILURE_CLASSES = [
  "ASSERTION",
  "APPLICATION_ERROR",
  "NETWORK_ERROR",
  "CONSOLE_ERROR",
  "ACCESSIBILITY",
  "TIMEOUT",
  "ENVIRONMENT",
  "TEST_INFRASTRUCTURE",
  "ORIGIN_ESCAPE",
  "UNKNOWN",
] as const;
export type QaFailureClass = (typeof QA_FAILURE_CLASSES)[number];

export const QaConsoleEntry = z.object({
  type: z.enum(["error", "warning", "info"]),
  text: z.string().max(1000),
  /** Page path at the time of the message (sanitized). */
  page: z.string().max(300).default(""),
});
export type QaConsoleEntryT = z.infer<typeof QaConsoleEntry>;

export const QaNetworkEntry = z.object({
  url: z.string().max(600),
  method: z.string().max(10).default("GET"),
  status: z.number().int().min(0).max(599).default(0),
  failure: z.string().max(300).default(""),
});
export type QaNetworkEntryT = z.infer<typeof QaNetworkEntry>;

export const QaAxeViolation = z.object({
  id: z.string().max(200),
  impact: z.string().max(20).default(""),
  description: z.string().max(600).default(""),
  nodes: z.number().int().nonnegative().default(0),
});
export type QaAxeViolationT = z.infer<typeof QaAxeViolation>;

export const QaViewportResult = z.object({
  viewport: z.enum(["desktop", "mobile"]),
  status: z.enum(["PASS", "FAIL", "SKIPPED"]),
  failureClass: z.enum(QA_FAILURE_CLASSES).optional(),
  failedStepIndex: z.number().int().nonnegative().optional(),
  message: z.string().max(1000).default(""),
  /** Artifact file names (screenshot/trace) stored OUTSIDE state JSON. */
  screenshot: z.string().max(300).optional(),
  trace: z.string().max(300).optional(),
  console: z.array(QaConsoleEntry).max(50).default([]),
  network: z.array(QaNetworkEntry).max(50).default([]),
  axeViolations: z.array(QaAxeViolation).max(50).default([]),
  durationMs: z.number().int().nonnegative().default(0),
});
export type QaViewportResultT = z.infer<typeof QaViewportResult>;

export const QaResult = z.object({
  schema: z.literal(QA_SCHEMA).default(QA_SCHEMA),
  id: z.string().min(1).max(80),
  journeyId: z.string().min(1).max(80),
  featureId: z.string().min(1),
  requirementIds: z.array(z.string()).default([]),
  ranAt: z.string().min(1),
  provider: z.string().max(60).default("playwright"),
  status: z.enum(["PASS", "FAIL", "UNAVAILABLE"]),
  /** UNAVAILABLE reason (provider missing) — never faked as PASS (§25). */
  unavailableReason: z.string().max(600).optional(),
  viewports: z.array(QaViewportResult).default([]),
  /** Deterministic hash of the journey's surface for freshness (§44). */
  surfaceHash: z.string().optional(),
  /** File surfaces the result covers (journey.surfaces ∪ freshness surface). */
  surfaces: z.array(z.string()).default([]),
  summary: z.string().max(2000).default(""),
});
export type QaResultT = z.infer<typeof QaResult>;
export type QaRunResult = QaResultT;

// ─── provider execution types (Guardian never sees Playwright) ───────────

export interface QaExecutionContext {
  baseUrl: string;
  allowedHosts: string[];
  trustedExternalOrigins: string[];
  allowedPrivateHosts: string[];
  viewports: Record<"desktop" | "mobile", { width: number; height: number }>;
  onArtifact?: (name: string, path: string) => void;
}

export interface QaJourneyRuntime {
  journey: QaJourneyT;
  context: QaExecutionContext;
}

/**
 * Browser QA provider interface (§24). Implementations: Playwright today;
 * future providers possible without touching Guardian or the gates.
 */
export interface BrowserQaProvider {
  readonly name: string;
  available(): Promise<boolean>;
  availabilityDetail(): Promise<string>;
  run(journey: QaJourneyT, context: QaExecutionContext): Promise<QaRunResult>;
}

/** QA capability report (§54). */
export interface QaCapabilities {
  provider: string;
  available: boolean;
  detail: string;
  projectConfig?: string;
  browsers?: Array<{ name: string; available: boolean }>;
  axeIntegration: boolean;
  baseUrl: string;
}

export const QA_FAILURE = QA_FAILURE_CLASSES;
