import * as fs from "node:fs";
import { pathExists } from "../util/fs.js";
import { sanitizeText } from "./redact.js";
import type { NewFindingInput } from "./store.js";
import type { SecurityPolicy } from "./schema.js";
import { AUTHZ_IDENTIFIERS, type SecuritySurfaceClassification } from "./classify.js";

/**
 * Authorization Guardian (§8) + tenant isolation (§9).
 *
 * Keyword signals alone are weak, so findings here combine identifiers with
 * route structure, requirement metadata, and data-access shape — and are
 * labeled honestly: confidence is "supported" only when multiple independent
 * signals agree, otherwise "inferred". The required confirmation (an
 * authorization test or human review) is always named in `basis`.
 */

const WRITE_VERBS = /\b(?:create|delete|remove|update|patch|post|put|grant|revoke|invite|accept|transfer|assign|publish)\w*/i;

export interface AuthzAnalysisResult {
  findings: NewFindingInput[];
  /** Files where authz-sensitive identifiers appear in the change. */
  touchedSensitiveFiles: Array<{ file: string; identifiers: string[] }>;
  /** Whether tenant-isolation evidence is demanded by policy + change shape. */
  tenantVerificationRequired: boolean;
  notes: string[];
}

/**
 * Strip comments so heuristics read code, not prose. A comment claiming a
 * permission check exists is not a permission check — comments are not
 * evidence (§3). Over-stripping inside string literals is acceptable here:
 * the heuristic errs toward flagging, and every finding still names the
 * required confirmation.
 */
function stripComments(content: string, file: string): string {
  if (/\.(py|rb|sh|ya?ml|toml)$/i.test(file)) {
    return content
      .split("\n")
      .map((l) => l.replace(/(^|\s)#.*$/, "$1"))
      .join("\n");
  }
  return content
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1"); // line comments (not URLs)
}

/** Route-ish paths (server endpoints) get a stronger authz prior. */
function looksLikeRoute(file: string): boolean {
  return /(?:^|\/)(api|routes|endpoints|controllers|handlers|resolvers)(?:\/|$)/i.test(file) || /\.(route|router|controller|handler|resolver)\.[a-z]+$/i.test(file);
}

/** Data-access-ish files (queries, models, services). */
function looksLikeDataAccess(file: string): boolean {
  return /(?:^|\/)(db|models|repositories|queries|services|data)(?:\/|$)/i.test(file) || /\.(query|repo|model|service)\.[a-z]+$/i.test(file);
}

export function analyzeAuthorization(
  root: string,
  featureId: string,
  classification: SecuritySurfaceClassification,
  policy: SecurityPolicy
): AuthzAnalysisResult {
  const findings: NewFindingInput[] = [];
  const touched: Array<{ file: string; identifiers: string[] }> = [];
  const notes: string[] = [];
  let routeSensitive = false;
  let dataAccessSensitive = false;
  let tenantKeySeen = false;

  const tenantKeys = policy.tenancy.enabled ? policy.tenancy.tenantKeys : [];

  for (const file of classification.changedFiles) {
    const abs = `${root}/${file}`;
    if (!pathExists(abs)) continue;
    try {
      const st = fs.statSync(abs);
      if (st.size > 200_000) continue;
      const content = stripComments(fs.readFileSync(abs, "utf8"), file);
      const ids = AUTHZ_IDENTIFIERS.filter((id) => new RegExp(`\\b${id}\\b`).test(content));
      if (ids.length === 0) continue;
      touched.push({ file, identifiers: ids });
      if (looksLikeRoute(file)) routeSensitive = true;
      if (looksLikeDataAccess(file)) dataAccessSensitive = true;
      if (tenantKeys.some((k) => new RegExp(`\\b${k}\\b`).test(content))) tenantKeySeen = true;

      // Write-shaped code in a route/data file that mentions tenant keys but
      // no permission vocabulary (in CODE — comments were stripped) is the
      // classic missing-check shape.
      const hasPermissionVocab = /\b(permission|authorize|allowed|canWrite|canDelete|requireAdmin|hasRole|hasPermission|isAdmin|role|owner|membership)\b/i.test(content);
      const writeShaped = WRITE_VERBS.test(content);
      if (writeShaped && looksLikeRoute(file) && !hasPermissionVocab) {
        findings.push({
          featureId,
          category: "authorization",
          severity: "HIGH",
          confidence: "inferred",
          source: "steward",
          ruleId: "authz-write-without-permission-vocab",
          file,
          line: 0,
          title: `Write-shaped endpoint code may lack an authorization check: ${file}`,
          detail: sanitizeText(
            `This changed file performs write-shaped operations (${ids.join(", ")} referenced) and no permission/role vocabulary was found. This is a heuristic signal, not proof: an authorization check may live in middleware, a guard, or a caller. Required confirmation: an authorization test or explicit security review of this endpoint.`,
            1200
          ),
          basis: [
            `file matches route structure (api/routes/controller shape): ${file}`,
            `sensitive identifiers present: ${ids.join(", ")}`,
            "no permission/role vocabulary in the changed file",
            "heuristic finding — confirmation required (authorization test or review)",
          ],
        });
      }

      // Tenant-shaped query without any tenant filter in a data-access file.
      if (policy.tenancy.enabled && dataAccessSensitive && tenantKeys.length > 0) {
        const hasTenantFilter = tenantKeys.some((k) => new RegExp(`\\b${k}\\b\\s*(?:===?|!==?|:|eq\\(|where)`, "i").test(content));
        if (writeShaped && !hasTenantFilter) {
          findings.push({
            featureId,
            category: "authorization",
            severity: "HIGH",
            confidence: "inferred",
            source: "steward",
            ruleId: "tenant-write-without-tenant-filter",
            file,
            line: 0,
            title: `Multi-tenant write may lack a ${tenantKeys[0]} boundary: ${file}`,
            detail: sanitizeText(
              `Tenancy is enabled (tenant keys: ${tenantKeys.join(", ")}) and this data-access file performs write-shaped operations without a visible tenant filter. A cross-tenant regression test is the required confirmation (e.g. Org A user → Org B object must be rejected/not found).`,
              1200
            ),
            basis: [
              `project policy declares tenancy with keys: ${tenantKeys.join(", ")}`,
              `data-access file changed: ${file}`,
              `tenant keys referenced but no filter expression found for ${tenantKeys.join("/")}`,
              "heuristic finding — cross-tenant test required",
            ],
          });
        }
      }
    } catch {
      /* unreadable: skip */
    }
  }

  // Cross-tenant requirement without isolation verification.
  const reqText = classification.featureRisk.signals.join(" ");
  const tenantKeysInRequirements = tenantKeys.some((k) => reqText.includes(k)) || classification.areas.some((a) => a.area === "tenant-isolation");
  if (policy.tenancy.enabled && tenantKeysInRequirements && !tenantKeySeen) {
    notes.push("tenancy is enabled and requirements suggest tenant surfaces, but no changed file references tenant keys — verify the change actually covers the isolated path");
  }

  const tenantVerificationRequired =
    policy.tenancy.enabled &&
    tenantKeys.length > 0 &&
    (tenantKeySeen || (classification.areas.some((a) => a.area === "tenant-isolation") && dataAccessSensitive));

  if (routeSensitive && findings.length === 0) {
    notes.push("authz-sensitive route files changed; permission vocabulary present — authorization review recorded as PASS only if evidence exists");
  }

  return { findings, touchedSensitiveFiles: touched, tenantVerificationRequired, notes };
}

/**
 * §49/§43: cross-tenant evidence from a QA/integration journey can satisfy
 * the tenant-isolation requirement. Steward accepts structured evidence of
 * the shape "actor from tenant A → object of tenant B → denied/not found".
 */
export interface TenantIsolationEvidence {
  journeyId?: string;
  testFile?: string;
  /** e.g. "Org A user → Org B object" */
  scenario: string;
  observed: "DENIED" | "NOT_FOUND" | "ALLOWED" | "ERROR";
  expected: "DENIED" | "NOT_FOUND";
  passed: boolean;
  recordedAt: string;
}

export function tenantEvidencePasses(e: TenantIsolationEvidence): boolean {
  return e.passed && (e.observed === e.expected || e.observed === "DENIED" || e.observed === "NOT_FOUND");
}
