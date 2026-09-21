import * as fs from "node:fs";
import { getFeature } from "../state/features.js";
import { listRequirements } from "../state/requirements.js";
import { listTasks } from "../state/tasks.js";
import { StateError, validateFeatureId } from "../state/ids.js";
import { workingTreeChanges, impactOfChangedFiles, type ChangeImpact } from "../intel/impact.js";
import { ensureIndex, type RepoIndex } from "../intel/index.js";
import { buildDependencyMap, toProjectRelative } from "../intel/graph.js";
import { classifyFeatureRisk, type RiskClassification, type EngineRiskLevel } from "../risk.js";
import { pathExists } from "../util/fs.js";
import type { SecurityPolicy } from "./schema.js";

/**
 * Change-aware security classification (§5). Instead of blindly scanning the
 * whole project every task, Security Guardian asks: what does THIS change
 * touch? Changed files + dependency graph + impact + requirements + policy
 * determine which security checks are relevant.
 */

export type SecurityArea =
  | "authentication"
  | "authorization"
  | "session-management"
  | "account-recovery"
  | "payments"
  | "permissions"
  | "tenant-isolation"
  | "public-api"
  | "database-access"
  | "secret-handling"
  | "cryptography"
  | "file-upload"
  | "user-content"
  | "redirects"
  | "webhooks"
  | "oauth"
  | "api-keys"
  | "external-fetching"
  | "admin"
  | "sensitive-data"
  | "dependencies";

export interface SecuritySignal {
  area: SecurityArea;
  /** Where the signal came from (provenance for the report). */
  origin: string;
}

/** File-path based area triggers (checked against changed file paths). */
const PATH_AREAS: Array<[RegExp, SecurityArea]> = [
  [/^(?:.*\/)?auth(?:entication)?[./_-]/i, "authentication"],
  [/^(?:.*\/)?(login|signin|sign-up|signup|logout|session)[./_-]/i, "authentication"],
  [/^(?:.*\/)?(rbac|role|permission|acl|policy)[./_-]/i, "authorization"],
  [/^(?:.*\/)?(tenant|organization|org-)[./_-]/i, "tenant-isolation"],
  [/^(?:.*\/)?(payment|billing|checkout|subscription|invoice)[./_-]/i, "payments"],
  [/\.(env|env\..+|pem|key)$/, "secret-handling"],
  [/^(?:.*\/)?(secret|secrets|credential|vault|keystore)[./_-]/i, "secret-handling"],
  [/^(?:.*\/)?(crypto|encrypt|hash|kms|jwt)[./_-]/i, "cryptography"],
  [/^(?:.*\/)?(upload|attachment|avatar|import)[./_-]/i, "file-upload"],
  [/^(?:.*\/)?(webhook|hook)[./_-]/i, "webhooks"],
  [/^(?:.*\/)?(oauth|sso|saml|oidc)[./_-]/i, "oauth"],
  [/^(?:.*\/)?(admin)[./_-]/i, "admin"],
  [/^(?:.*\/)?(redirect|return-url|callback-url)/i, "redirects"],
  [/^(?:.*\/)?(fetch|proxy|url-preview|scrape|crawler)[./_-]/i, "external-fetching"],
  [/^(?:.*\/)?(middleware|guard|interceptor)[./_-]/i, "authentication"],
  [/^(?:.*\/)?(api|routes|router|endpoint)/i, "public-api"],
  [/^(?:.*\/)?(db|database|migration|schema)/i, "database-access"],
  [/^(?:.*\/)?(profile|user|account|member|invite)/i, "authorization"],
];

/** Content-keyword based area triggers (checked against changed file text). */
const CONTENT_AREAS: Array<[RegExp, SecurityArea]> = [
  [/\b(?:session|cookie|csrf|_csrf|samesite)\b/i, "session-management"],
  [/\b(?:password|passwd|recovery|reset[- ]?password|otp|2fa|mfa)\b/i, "authentication"],
  [/\b(?:permission|canWrite|canDelete|authorize|isOwner|hasRole|hasPermission|requireAdmin)\b/i, "authorization"],
  [/\b(?:organizationId|tenantId|workspaceId|tenant_id|organization_id)\b/, "tenant-isolation"],
  [/\b(?:stripe|payment_intent|subscription|billing|invoice|refund)\b/i, "payments"],
  [/\b(?:process\.env\.|API_KEY|SECRET|TOKEN|credentials)\b/, "secret-handling"],
  [/\b(?:bcrypt|argon|aes|cipher|jwt|sign|verify|hmac|privateKey)\b/i, "cryptography"],
  [/\b(?:multer|formdata|file\.path|upload|attachment|S3|presign)\b/i, "file-upload"],
  [/\b(?:dangerouslySetInnerHTML|innerHTML|v-html|markdown|sanitize|escapeHtml)\b/i, "user-content"],
  [/\b(?:redirect|window\.location|res\.redirect|returnUrl|redirectUrl)\b/i, "redirects"],
  [/\b(?:webhook|signature=|hmac.*event)\b/i, "webhooks"],
  [/\b(?:oauth|oidc|saml|token exchange|authorization_code)\b/i, "oauth"],
  [/\b(?:fetch\(|axios\.|http\.request|httpClient)\b/i, "external-fetching"],
  [/\b(?:SELECT|INSERT INTO|UPDATE |DELETE FROM|\.query\(|\.where\(|drizzle|prisma)\b/, "database-access"],
  [/\b(?:pii|sensitive|personal data|gdpr|hipaa)\b/i, "sensitive-data"],
  [/\b(?:\badmin\b|isAdmin|adminOnly|role\s*===?\s*["']admin["'])/i, "admin"],
];

/** Requirement-text keywords → areas (weak signal, labeled). */
const REQ_AREAS: Array<[RegExp, SecurityArea]> = [
  [/\b(?:authentication|log in|sign in|session|password)\b/i, "authentication"],
  [/\b(?:only .*(?:admin|owner)|permission|authorized|role)\b/i, "authorization"],
  [/\b(?:tenant|organization|workspace|other user|another (?:user|org|tenant)|cross-tenant)\b/i, "tenant-isolation"],
  [/\b(?:payment|billing|charge|subscription)\b/i, "payments"],
  [/\b(?:secret|api key|token|credential)\b/i, "secret-handling"],
  [/\b(?:upload|attachment|import)\b/i, "file-upload"],
  [/\b(?:redirect|callback)\b/i, "redirects"],
  [/\b(?:webhook)\b/i, "webhooks"],
  [/\b(?:encrypt|decrypt|hash|crypto)\b/i, "cryptography"],
  [/\b(?:admin)\b/i, "admin"],
];

/** Lockfile/manifest paths → dependency relevance. */
const DEP_FILES = [
  /^(package(-lock)?\.json|bun\.lock|bun\.lockb|pnpm-lock\.yaml|yarn\.lock)$/,
  /^(Cargo\.(toml|lock)|poetry\.lock|poetry\.toml|pyproject\.toml|requirements(\.txt|\.lock)|go\.sum)$/,
  /^(packages\/.+\/)?(package(-lock)?\.json|bun\.lock|bun\.lockb|pnpm-lock\.yaml|yarn\.lock)$/,
];

export interface SecuritySurfaceClassification {
  featureId: string;
  risk: EngineRiskLevel;
  /** Areas this change plausibly touches, with provenance. */
  areas: Array<{ area: SecurityArea; origins: string[] }>;
  /** Deterministic risk-engine classification (unchanged Phase 2 behavior). */
  featureRisk: RiskClassification;
  /** Required checks for this specific change, in execution order. */
  requiredChecks: Array<"secretScan" | "dependencyScan" | "staticScan" | "authorizationReview" | "tenantIsolation" | "threatModel">;
  notes: string[];
  impact: ChangeImpact | null;
  changedFiles: string[];
  /** Whether ANY security-relevant area was touched at all. */
  securityRelevant: boolean;
}

/**
 * Classify the security surface of a feature's current change set.
 * Deterministic: same changed files, same classification. Provenance for
 * every area is recorded so review output answers "why is this check here?".
 */
export function classifySecuritySurface(
  root: string,
  featureId: string,
  policy: SecurityPolicy,
  opts: { changed?: string[] } = {}
): SecuritySurfaceClassification {
  validateFeatureId(featureId);
  const feature = getFeature(root, featureId);
  const requirements = listRequirements(root, featureId);
  const tasks = listTasks(root, featureId);
  const featureRisk = classifyFeatureRisk({
    request: feature.request,
    spec: null,
    requirements,
    tasks,
  });

  const changed = (opts.changed ?? workingTreeChanges(root))
    .map((c) => toProjectRelative(root, c))
    .filter((c) => c !== ".steward" && !c.startsWith(".steward/") && c !== ".vibe" && !c.startsWith(".vibe/"));

  let impact: ChangeImpact | null = null;
  try {
    impact = changed.length > 0 ? impactOfChangedFiles(root, changed) : null;
  } catch {
    impact = null;
  }

  const areaOrigins = new Map<SecurityArea, string[]>();
  const addArea = (area: SecurityArea, origin: string) => {
    const list = areaOrigins.get(area) ?? [];
    if (!list.includes(origin)) list.push(origin);
    areaOrigins.set(area, list);
  };

  // 1. changed file paths
  for (const file of changed) {
    for (const [re, area] of PATH_AREAS) {
      if (re.test(file)) addArea(area, `changed path ${file}`);
    }
    if (DEP_FILES.some((re) => re.test(file))) addArea("dependencies", `manifest changed: ${file}`);
  }

  // 2. changed file contents (bounded: read each file once, max 200k)
  for (const file of changed) {
    const abs = `${root}/${file}`;
    if (!pathExists(abs) || !/\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|rb|java|kt|yml|yaml|sql|env)$/i.test(file)) continue;
    try {
      const st = fs.statSync(abs);
      if (st.size > 200_000) continue;
      const content = fs.readFileSync(abs, "utf8");
      for (const [re, area] of CONTENT_AREAS) {
        if (re.test(content)) addArea(area, `content of ${file}`);
      }
    } catch {
      /* unreadable: skip */
    }
  }

  // 3. requirement text (labeled as requirement-driven, weaker signal)
  const reqText = requirements.map((r) => `${r.title} ${r.description} ${r.acceptance.join(" ")}`).join("\n");
  for (const [re, area] of REQ_AREAS) {
    if (re.test(reqText)) addArea(area, "requirement text");
  }

  // 4. policy: project-declared review triggers
  for (const signal of policy.requireReviewFor) {
    const area = signal as SecurityArea;
    if (areaOrigins.has(area)) continue;
    // policy forces the check when the area is plausibly involved
    if (PATH_AREAS.some(([re, a]) => a === area && changed.some((f) => re.test(f)))) {
      addArea(area, `policy requireReviewFor: ${signal}`);
    }
  }

  const areas = [...areaOrigins.entries()].map(([area, origins]) => ({ area, origins }));
  const securityRelevant = areas.length > 0;

  const has = (a: SecurityArea) => areaOrigins.has(a);
  const requiredChecks: SecuritySurfaceClassification["requiredChecks"] = [];
  if (policy.secretScan.enabled) requiredChecks.push("secretScan");
  if (policy.dependencyScan.enabled && (has("dependencies") || has("payments") || has("database-access"))) requiredChecks.push("dependencyScan");
  if (has("authorization") || has("tenant-isolation") || has("authentication")) requiredChecks.push("authorizationReview");
  if (policy.tenancy.enabled && (has("tenant-isolation") || has("database-access"))) requiredChecks.push("tenantIsolation");
  if (featureRisk.level === "HIGH" || featureRisk.level === "CRITICAL") requiredChecks.push("threatModel");

  const notes: string[] = [];
  if (!securityRelevant) notes.push("no security-relevant areas touched by this change; heavy checks skipped");

  return {
    featureId,
    risk: featureRisk.level,
    areas,
    featureRisk,
    requiredChecks,
    notes,
    impact,
    changedFiles: changed,
    securityRelevant,
  };
}

/** Sensitive identifiers the authorization guardian watches (§8). */
export const AUTHZ_IDENTIFIERS = [
  "organizationId", "tenantId", "accountId", "userId", "workspaceId",
  "role", "permission", "owner", "admin", "membership", "actor",
] as const;

export function authzIdentifiersIn(text: string): string[] {
  return AUTHZ_IDENTIFIERS.filter((id) => new RegExp(`\\b${id}\\b`).test(text));
}

export type { RepoIndex };
