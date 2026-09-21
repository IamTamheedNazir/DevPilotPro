import { z } from "zod";

/**
 * Security Guardian schemas — versioned steward.security.v1. Third-party
 * scanner output is NEVER stored raw: it is normalized into these models
 * first, with provenance attached (why Steward believes this).
 */

export const SECURITY_SCHEMA = "steward.security.v1";

export const SECURITY_CATEGORIES = [
  "secret",
  "dependency",
  "authentication",
  "authorization",
  "input-validation",
  "injection",
  "xss",
  "csrf",
  "ssrf",
  "redirect",
  "file-upload",
  "path-traversal",
  "crypto",
  "sensitive-data",
  "logging",
  "configuration",
  "supply-chain",
  "agent-execution",
  "other",
] as const;
export type SecurityCategory = (typeof SECURITY_CATEGORIES)[number];

export const SECURITY_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;
export type SecuritySeverity = (typeof SECURITY_SEVERITIES)[number];

export const SECURITY_CONFIDENCE = ["proven", "supported", "inferred"] as const;
export type SecurityConfidence = (typeof SECURITY_CONFIDENCE)[number];

export const SECURITY_SOURCES = ["steward", "osv", "semgrep", "project-tool", "manual", "other"] as const;
export type SecuritySource = (typeof SECURITY_SOURCES)[number];

export const FINDING_STATUSES = ["OPEN", "RESOLVED", "ACCEPTED_RISK", "FALSE_POSITIVE"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const EvidenceReference = z.object({
  kind: z.enum(["ledger", "file", "test", "command", "journey"]),
  ref: z.string().min(1).max(400),
  detail: z.string().max(400).default(""),
});
export type EvidenceReference = z.infer<typeof EvidenceReference>;

export const SecurityFinding = z.object({
  schema: z.literal(SECURITY_SCHEMA).default(SECURITY_SCHEMA),
  id: z.string().min(1).max(64),
  featureId: z.string().optional(),
  requirementIds: z.array(z.string()).default([]),
  taskIds: z.array(z.string()).default([]),
  category: z.enum(SECURITY_CATEGORIES),
  severity: z.enum(SECURITY_SEVERITIES),
  confidence: z.enum(SECURITY_CONFIDENCE),
  source: z.enum(SECURITY_SOURCES),
  /** Which check/rule produced this finding (provenance). */
  ruleId: z.string().max(200).default(""),
  /** File the finding refers to (project-relative, validated at write time). */
  file: z.string().max(400).default(""),
  line: z.number().int().nonnegative().default(0),
  /** REDACTED, bounded description — never raw secret/scanner blobs. */
  title: z.string().max(400),
  detail: z.string().max(2000).default(""),
  /**
   * Provenance basis (§62): the deterministic facts that caused Steward to
   * believe this. Must answer "why does Steward believe this?".
   */
  basis: z.array(z.string().max(300)).default([]),
  /** Dependency-only (§15): affected is PROVEN; reachability is recorded, not assumed. */
  dependencyReachable: z.enum(["UNKNOWN", "REACHABLE", "NOT_REACHABLE"]).optional(),
  evidence: z.array(EvidenceReference).default([]),
  status: z.enum(FINDING_STATUSES).default("OPEN"),
  /** PRE-EXISTING findings were on the security baseline before this change. */
  introducedBy: z.enum(["CURRENT_CHANGE", "PRE_EXISTING", "UNKNOWN"]).default("UNKNOWN"),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type SecurityFindingT = z.infer<typeof SecurityFinding>;

export const SecurityFindingsFile = z.object({
  schema: z.literal(SECURITY_SCHEMA).default(SECURITY_SCHEMA),
  featureId: z.string().min(1),
  findings: z.array(SecurityFinding).default([]),
});
export type SecurityFindingsFileT = z.infer<typeof SecurityFindingsFile>;

// ─── exceptions ──────────────────────────────────────────────────────────

export const SecurityException = z.object({
  schema: z.literal(SECURITY_SCHEMA).default(SECURITY_SCHEMA),
  id: z.string().min(1).max(64),
  findingId: z.string().min(1).max(64),
  /** reason required — accepted risks are never silent. */
  reason: z.string().min(3).max(1000),
  scope: z.string().max(400).default(""),
  owner: z.string().max(120).default("project"),
  expires: z.string().optional(), // ISO date; expired exceptions reactivate findings
  createdAt: z.string().min(1),
});
export type SecurityExceptionT = z.infer<typeof SecurityException>;

export const SecurityExceptionsFile = z.object({
  schema: z.literal(SECURITY_SCHEMA).default(SECURITY_SCHEMA),
  exceptions: z.array(SecurityException).default([]),
});
export type SecurityExceptionsFileT = z.infer<typeof SecurityExceptionsFile>;

// ─── reviews ─────────────────────────────────────────────────────────────

export const SECURITY_CHECK_STATUSES = ["PASS", "FAIL", "NOT_AFFECTED", "UNAVAILABLE", "SKIPPED"] as const;
export type SecurityCheckStatus = (typeof SECURITY_CHECK_STATUSES)[number];

export const SecurityCheckReport = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  status: z.enum(SECURITY_CHECK_STATUSES),
  detail: z.string().max(1000).default(""),
  findingIds: z.array(z.string()).optional(),
});
export type SecurityCheckReportT = z.infer<typeof SecurityCheckReport>;

export const SecurityReview = z.object({
  schema: z.literal(SECURITY_SCHEMA).default(SECURITY_SCHEMA),
  id: z.string().min(1).max(64),
  featureId: z.string().min(1),
  reviewedAt: z.string().min(1),
  /** Deterministic security surface classification for this change. */
  surface: z.array(z.string()).default([]),
  risk: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("LOW"),
  checks: z.array(SecurityCheckReport).default([]),
  findingIds: z.array(z.string()).default([]),
  verdict: z.enum(["pass", "fail", "not_required"]).default("fail"),
  summary: z.string().max(2000).default(""),
  surfaceHash: z.string().optional(),
});
export type SecurityReviewT = z.infer<typeof SecurityReview>;

export const SecurityBaseline = z.object({
  schema: z.literal(SECURITY_SCHEMA).default(SECURITY_SCHEMA),
  capturedAt: z.string().min(1),
  revision: z.string().default(""),
  /** Fingerprints of findings that already existed at baseline time. */
  fingerprints: z.array(z.string()).default([]),
});
export type SecurityBaselineT = z.infer<typeof SecurityBaseline>;

// ─── threat models (small and feature-specific) ──────────────────────────

export const ThreatScenario = z.object({
  id: z.string().min(1).max(64),
  featureId: z.string().min(1),
  title: z.string().min(1).max(300),
  asset: z.string().max(200).default(""),
  actor: z.string().max(200).default(""),
  control: z.string().max(400).default(""),
  /** How the control is verified: a test file, QA journey, or check id. */
  verification: z.string().max(400).default(""),
  status: z.enum(["PENDING", "VERIFIED", "MITIGATED"]).default("PENDING"),
  note: z.string().max(600).default(""),
});
export type ThreatScenarioT = z.infer<typeof ThreatScenario>;

export const ThreatModel = z.object({
  schema: z.literal(SECURITY_SCHEMA).default(SECURITY_SCHEMA),
  id: z.string().min(1).max(64),
  featureId: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  assets: z.array(z.string().max(300)).default([]),
  actors: z.array(z.string().max(300)).default([]),
  trustBoundaries: z.array(z.string().max(300)).default([]),
  entryPoints: z.array(z.string().max(300)).default([]),
  sensitiveOperations: z.array(z.string().max(300)).default([]),
  existingControls: z.array(z.string().max(300)).default([]),
  scenarios: z.array(ThreatScenario).default([]),
  requiredVerification: z.array(z.string().max(300)).default([]),
  residualRisks: z.array(z.string().max(300)).default([]),
});
export type ThreatModelT = z.infer<typeof ThreatModel>;

// ─── security policy (project.yaml `security:` block) ────────────────────

export const SecurityPolicyConfig = z.object({
  /** Extra signals (risk ids) that require a security review beyond the built-ins. */
  requireReviewFor: z.array(z.string()).default([]),
  /** Severities that block completion while unresolved. */
  block: z
    .object({
      critical: z.boolean().default(true),
      high: z.boolean().default(true),
      medium: z.boolean().default(false),
    })
    .default({ critical: true, high: true, medium: false }),
  dependencyScan: z.object({ enabled: z.boolean().default(true) }).default({ enabled: true }),
  secretScan: z
    .object({
      enabled: z.boolean().default(true),
      includeStaged: z.boolean().default(false),
      includeHistory: z.boolean().default(false), // only ever explicit
    })
    .default({ enabled: true, includeStaged: false, includeHistory: false }),
  tenancy: z
    .object({
      enabled: z.boolean().default(false),
      tenantKeys: z.array(z.string()).default([]),
    })
    .default({ enabled: false, tenantKeys: [] }),
  /** Local semgrep config (ruleset file path or registered ruleset) — optional. */
  semgrepConfig: z.string().optional(),
});
export type SecurityPolicy = z.infer<typeof SecurityPolicyConfig>;

export const DEFAULT_SECURITY_POLICY: SecurityPolicy = SecurityPolicyConfig.parse({});

// ─── QA policy (project.yaml `qa:` block) ────────────────────────────────

export const ViewportConfig = z.object({
  width: z.number().int().min(200).max(4000),
  height: z.number().int().min(200).max(4000),
});

export const QaPolicyConfig = z.object({
  requiredFor: z.array(z.enum(["user-facing", "ui", "frontend"])).default([]),
  browsers: z.array(z.enum(["chromium", "firefox", "webkit"])).default(["chromium"]),
  accessibility: z.object({ automated: z.boolean().default(true) }).default({ automated: true }),
  consoleErrors: z.object({ fail: z.boolean().default(true) }).default({ fail: true }),
  failedRequests: z
    .object({
      fail5xx: z.boolean().default(true),
      fail4xx: z.boolean().default(false),
    })
    .default({ fail5xx: true, fail4xx: false }),
  viewports: z
    .object({
      desktop: ViewportConfig.default({ width: 1440, height: 900 }),
      mobile: ViewportConfig.default({ width: 390, height: 844 }),
    })
    .default({ desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } }),
  baseUrl: z.string().default("http://localhost:3000"),
  /** Hosts browser QA may target. Never broadened implicitly (§40, §67). */
  allowedHosts: z.array(z.string()).default(["localhost", "127.0.0.1"]),
  /** Trusted external origins a journey may navigate to (OAuth/payments). */
  trustedExternalOrigins: z.array(z.string()).default([]),
  /** Explicitly allowed private-network targets for authorized testing. */
  allowedPrivateHosts: z.array(z.string()).default([]),
});
export type QaPolicy = z.infer<typeof QaPolicyConfig>;

export const DEFAULT_QA_POLICY: QaPolicy = QaPolicyConfig.parse({});

/** Severity ordering helpers. */
const SEV_ORDER: Record<SecuritySeverity, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 };
export function severityAtLeast(a: SecuritySeverity, b: SecuritySeverity): boolean {
  return SEV_ORDER[a] >= SEV_ORDER[b];
}
export function maxSeverity(a: SecuritySeverity, b: SecuritySeverity): SecuritySeverity {
  return SEV_ORDER[a] >= SEV_ORDER[b] ? a : b;
}
