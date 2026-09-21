import type { Feature, Requirement, Spec, Task } from "./state/schema.js";

/**
 * Deterministic risk engine. Signals come from understandable rules over the
 * feature's own text (request, spec, requirements, tasks). The deterministic
 * level is a floor: agent observations may RAISE the level but never lower
 * the mandatory gates that follow from it.
 */

export type EngineRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface RiskSignal {
  id: string;
  level: EngineRiskLevel;
  description: string;
  patterns: RegExp[];
}

export const RISK_SIGNALS: readonly RiskSignal[] = [
  {
    id: "auth",
    level: "HIGH",
    description: "authentication changes (login, sessions, tokens, passwords)",
    patterns: [/\bauth(?:entication)?\b/i, /\blogin\b/i, /\bsign[- ]?in\b/i, /\bpassword\b/i, /\bsession\b/i, /\btoken\b/i, /\boauth\b/i, /\bsso\b/i],
  },
  {
    id: "authorization",
    level: "HIGH",
    description: "authorization/permission changes (roles, access control)",
    patterns: [/\bauthoriz(?:ation|e)\b/i, /\bpermission/i, /\brbac\b/i, /\brole[s]?\b/i, /\baccess control\b/i, /\badmin\b/i],
  },
  {
    id: "payments",
    level: "HIGH",
    description: "payment/billing changes",
    patterns: [/\bpayment/i, /\bbilling\b/i, /\bcheckout\b/i, /\bsubscription\b/i, /\bstripe\b/i, /\brefund/i],
  },
  {
    id: "secrets",
    level: "HIGH",
    description: "credentials or secret handling",
    patterns: [/\bsecret/i, /\bcredential/i, /\bapi[- ]?key\b/i, /\benv var/i],
  },
  {
    id: "crypto",
    level: "HIGH",
    description: "encryption or hashing changes",
    patterns: [/\bencrypt/i, /\bdecrypt/i, /\bhashing\b/i, /\bcrypt\b/i, /\bprivate key\b/i],
  },
  {
    id: "migration",
    level: "HIGH",
    description: "destructive or irreversible database migration",
    patterns: [/\bmigration/i, /\bschema (change|migration)/i, /\bdrop (table|column|database)/i, /\bdestructive\b/i],
  },
  {
    id: "sensitive-data",
    level: "HIGH",
    description: "sensitive/personal data handling",
    patterns: [/\bpii\b/i, /\bpersonal data\b/i, /\bsensitive (data|info)/i, /\bmedical\b/i, /\bfinancial data\b/i],
  },
  {
    id: "public-api",
    level: "MEDIUM",
    description: "public API contract change",
    patterns: [/\bpublic api\b/i, /\bbreaking change\b/i, /\bapi (contract|version)/i, /\bdeprecat/i],
  },
  {
    id: "infrastructure",
    level: "MEDIUM",
    description: "production infrastructure or deployment changes",
    patterns: [/\bproduction\b/i, /\bdeploy/i, /\binfrastructure\b/i, /\bterraform\b/i, /\bkubernetes\b/i],
  },
  {
    id: "dependency-replacement",
    level: "MEDIUM",
    description: "dependency replacement or major upgrade",
    patterns: [/\breplace .*(library|dependency|package)\b/i, /\bmajor (upgrade|version)\b/i, /\bmigrate from\b/i],
  },
  {
    id: "ui",
    level: "MEDIUM",
    description: "user-facing UI changes (browser QA relevant)",
    patterns: [/\bui\b/i, /\binterface\b/i, /\bpage\b/i, /\bform\b/i, /\bbutton\b/i, /\bprofile\b/i, /\bdisplay/i, /\brender/i, /\bfrontend\b/i, /\bscreen\b/i],
  },
  {
    id: "schema-additive",
    level: "LOW",
    description: "additive data model change",
    patterns: [/\bmodel\b/i, /\bentity\b/i, /\btable\b/i, /\bfield\b/i, /\bcolumn\b/i],
  },
];

const LEVEL_ORDER: Record<EngineRiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

export function maxRisk(a: EngineRiskLevel, b: EngineRiskLevel): EngineRiskLevel {
  return LEVEL_ORDER[a] >= LEVEL_ORDER[b] ? a : b;
}

export interface RiskClassification {
  level: EngineRiskLevel;
  signals: string[];
  /** Signals that mandate extra gates. */
  requiresBrowserQA: boolean;
  requiresSecurityReview: boolean;
}

/**
 * Classify risk from the feature's own artifacts. Deterministic: same text,
 * same result — no invented numbers.
 */
export function classifyFeatureRisk(input: {
  request?: string;
  spec?: Spec | null;
  requirements?: Requirement[];
  tasks?: Task[];
}): RiskClassification {
  const chunks: string[] = [];
  if (input.request) chunks.push(input.request);
  if (input.spec) {
    chunks.push(input.spec.objective);
    chunks.push(...input.spec.expectedBehavior, ...input.spec.constraints, ...input.spec.risks);
  }
  for (const r of input.requirements ?? []) {
    chunks.push(r.title, r.description, ...r.acceptance);
  }
  for (const t of input.tasks ?? []) {
    chunks.push(t.objective, ...t.implementationNotes, ...t.expectedFiles);
  }
  const text = chunks.join("\n");

  const signals: string[] = [];
  let level: EngineRiskLevel = "LOW";
  let requiresBrowserQA = false;
  let requiresSecurityReview = false;
  for (const signal of RISK_SIGNALS) {
    if (signal.patterns.some((p) => p.test(text))) {
      signals.push(signal.id);
      level = maxRisk(level, signal.level);
      if (signal.id === "ui") requiresBrowserQA = true;
      if (["auth", "authorization", "payments", "secrets", "crypto", "migration", "sensitive-data"].includes(signal.id)) {
        requiresSecurityReview = true;
      }
    }
  }
  return { level, signals, requiresBrowserQA, requiresSecurityReview };
}

/** Deterministic level, optionally raised by agent observations. */
export function effectiveRisk(feature: Feature, deterministic: RiskClassification): EngineRiskLevel {
  return maxRisk(feature.risk, deterministic.level);
}

export const GATE_SECURITY_LEVELS: readonly EngineRiskLevel[] = ["HIGH", "CRITICAL"];
