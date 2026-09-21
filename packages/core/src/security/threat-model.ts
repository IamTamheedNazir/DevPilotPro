import { getFeature } from "../state/features.js";
import { listRequirements } from "../state/requirements.js";
import { listTasks } from "../state/tasks.js";
import { readSpec } from "../state/specs.js";
import { validateFeatureId } from "../state/ids.js";
import { nowIso } from "../state/store.js";
import { classifySecuritySurface, type SecuritySurfaceClassification } from "./classify.js";
import { readThreatModel, writeThreatModel } from "./store.js";
import { readSecurityPolicy } from "./policy.js";
import type { ThreatModelT, ThreatScenarioT, SecurityPolicy } from "./schema.js";

/**
 * Threat modeling (§6, §7): SMALL and feature-specific. Generated
 * deterministically from the feature's spec text, requirements, and security
 * surface — never a 40-page document. Scenarios map to a named verification
 * (test file, QA journey, or check id) so Guardian can demand proof.
 */

export function generateThreatModel(root: string, featureId: string, policy?: SecurityPolicy): ThreatModelT {
  validateFeatureId(featureId);
  const feature = getFeature(root, featureId);
  const requirements = listRequirements(root, featureId);
  const tasks = listTasks(root, featureId);
  const spec = readSpec(root, featureId);
  const secPolicy = policy ?? readSecurityPolicy(root);
  const classification = classifySecuritySurface(root, featureId, secPolicy, { changed: [] });

  const reqText = requirements
    .map((r) => `${r.title} ${r.description} ${r.acceptance.join(" ")}`)
    .join(" ");
  const narrative = `${spec ? [spec.objective, ...spec.expectedBehavior].join(" ") : ""}\n${feature.request ?? feature.title}\n${reqText}`;

  const existing = readThreatModel(root, featureId);
  const model: ThreatModelT = {
    schema: "steward.security.v1",
    id: `TM-${featureId}`,
    featureId,
    createdAt: existing?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
    assets: deriveAssets(narrative),
    actors: deriveActors(narrative),
    trustBoundaries: deriveBoundaries(classification),
    entryPoints: deriveEntryPoints(classification),
    sensitiveOperations: deriveOperations(classification),
    existingControls: deriveControls(classification),
    scenarios: existing?.scenarios ?? [],
    requiredVerification: [...classification.requiredChecks],
    residualRisks: existing?.residualRisks ?? [],
  };

  if (model.scenarios.length === 0) {
    model.scenarios = buildScenarios(featureId, feature.title, classification, narrative);
  }

  writeThreatModel(root, model);
  return model;
}

/** Deterministic scenario ids: THREAT-<AREA>-NNN derived from area + index. */
function scenarioIdFor(featureId: string, area: string, index: number): string {
  const areaSlug = area.replace(/[^a-z]/gi, "").slice(0, 12).toUpperCase() || "GEN";
  return `THREAT-${areaSlug}-${String(index + 1).padStart(3, "0")}`;
}

function buildScenarios(
  featureId: string,
  featureTitle: string,
  classification: SecuritySurfaceClassification,
  narrative: string
): ThreatScenarioT[] {
  const scenarios: ThreatScenarioT[] = [];
  const seeds: Array<{
    area: string;
    title: string;
    asset: string;
    actor: string;
    control: string;
    verification: string;
  }> = [
    {
      area: "authorization",
      title: `Unauthorized actor attempts a privileged action in ${featureTitle}`,
      asset: "Privileged operations on user/organization data",
      actor: "Authenticated user without the required role",
      control: "Server-side permission check before the operation",
      verification: "authorization integration test (denied without role)",
    },
    {
      area: "tenant-isolation",
      title: `Actor from tenant A accesses tenant B's data via ${featureTitle}`,
      asset: "Tenant data isolation",
      actor: "Member of another tenant/organization",
      control: "Tenant key enforced at every data-access boundary",
      verification: "cross-tenant integration test (Org A user → Org B object → rejected/not found)",
    },
    {
      area: "authentication",
      title: `Unauthenticated request reaches a protected surface in ${featureTitle}`,
      asset: "Authenticated session boundary",
      actor: "Unauthenticated request",
      control: "Auth middleware rejects requests without a valid session",
      verification: "unauthenticated-access test (401/redirect)",
    },
    {
      area: "secret-handling",
      title: `A credential is committed alongside ${featureTitle}`,
      asset: "Credentials and API keys",
      actor: "Developer workflow (accidental)",
      control: "Secret scanning on changed content before commit",
      verification: "steward secret scan (BLOCKER on hit)",
    },
    {
      area: "payments",
      title: `Payment state manipulated outside the intended flow in ${featureTitle}`,
      asset: "Payment and billing integrity",
      actor: "Authenticated user tampering with client-side state",
      control: "Server-side price/state validation and webhook signature checks",
      verification: "payment state-tamper test",
    },
  ];

  let index = 0;
  for (const seed of seeds) {
    const relevant = classification.areas.some((a) => a.area === seed.area);
    if (!relevant) continue;
    scenarios.push({
      id: scenarioIdFor(featureId, seed.area, index),
      featureId,
      title: seed.title,
      asset: seed.asset,
      actor: seed.actor,
      control: seed.control,
      verification: seed.verification,
      status: "PENDING",
      note: "",
    });
    index += 1;
  }

  if (scenarios.length === 0) {
    scenarios.push({
      id: scenarioIdFor(featureId, "GEN", 0),
      featureId,
      title: `Abuse of ${featureTitle} outside its intended use`,
      asset: deriveAssets(narrative)[0] ?? "Feature data",
      actor: "Any user",
      control: "To be identified during security review",
      verification: "Named in security review",
      status: "PENDING",
      note: "Generic fallback scenario — refine during review",
    });
  }
  return scenarios;
}

// ─── deterministic derivation helpers ────────────────────────────────────

function deriveAssets(text: string): string[] {
  const assets = new Set<string>();
  if (/\b(member|user|account|profile)\b/i.test(text)) assets.add("User account and membership data");
  if (/\b(organization|org|tenant|workspace)\b/i.test(text)) assets.add("Organization/tenant membership data");
  if (/\b(payment|billing|invoice|subscription)\b/i.test(text)) assets.add("Payment and billing data");
  if (/\b(secret|api key|token|credential)\b/i.test(text)) assets.add("Credentials and API keys");
  if (/\b(file|upload|attachment)\b/i.test(text)) assets.add("Uploaded files and attachments");
  if (assets.size === 0) assets.add("Feature data");
  return [...assets];
}

function deriveActors(text: string): string[] {
  const actors = new Set<string>(["Authenticated user", "Unauthenticated request"]);
  if (/\b(admin|owner)\b/i.test(text)) actors.add("Administrator");
  if (/\b(org|organization|tenant|workspace|another user|other user)\b/i.test(text)) {
    actors.add("Member of another tenant");
  }
  return [...actors];
}

function deriveBoundaries(classification: SecuritySurfaceClassification): string[] {
  return classification.areas.slice(0, 8).map((a) => `${a.area} boundary (${a.origins[0] ?? "changed code"})`);
}

function deriveEntryPoints(classification: SecuritySurfaceClassification): string[] {
  const routeFiles = classification.changedFiles.filter(isRouteLike);
  if (routeFiles.length > 0) return routeFiles.slice(0, 10);
  return classification.changedFiles.slice(0, 5).map((f) => `${f} (changed surface)`);
}

function deriveOperations(classification: SecuritySurfaceClassification): string[] {
  return classification.changedFiles.slice(0, 10);
}

function deriveControls(classification: SecuritySurfaceClassification): string[] {
  const controls: string[] = [];
  if (classification.requiredChecks.includes("authorizationReview")) {
    controls.push("Server-side authorization checks (to be evidenced)");
  }
  if (classification.requiredChecks.includes("tenantIsolation")) {
    controls.push("Tenant isolation in data access (to be evidenced)");
  }
  if (classification.requiredChecks.includes("secretScan")) {
    controls.push("Secret scanning on changed content");
  }
  if (classification.requiredChecks.includes("dependencyScan")) {
    controls.push("Dependency vulnerability scanning");
  }
  return controls.length > 0 ? controls : ["Standard test suite"];
}

function isRouteLike(file: string): boolean {
  return (
    /(?:^|\/)(api|routes|endpoints|controllers|handlers|resolvers)(?:\/|$)/i.test(file) ||
    /\.(route|router|controller|handler|resolver)\.[a-z]+$/i.test(file)
  );
}
