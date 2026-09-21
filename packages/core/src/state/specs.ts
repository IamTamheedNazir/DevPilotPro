import * as fs from "node:fs";
import { SpecConfig, type Spec } from "./schema.js";
import { validateFeatureId, StateError } from "./ids.js";
import { nowIso, readYaml, writeYaml } from "./store.js";
import { stewardPaths } from "./paths.js";
import { brainPaths } from "../brain/paths.js";
import { Ledger } from "../schema/ledger.js";
import { VERSION } from "../version.js";
import { getFeature, transitionFeature } from "./features.js";
import { slugify } from "../util/slug.js";

const ACTOR = `steward-core@${VERSION}`;

export interface SpecInput {
  objective: string;
  personas?: string[];
  expectedBehavior?: string[];
  constraints?: string[];
  assumptions?: string[];
  outOfScope?: string[];
  acceptanceCriteria?: string[];
  risks?: string[];
  openQuestions?: string[];
}

/** Create (or refuse to silently replace) a feature's specification. */
export function createSpec(root: string, featureId: string, input: SpecInput): Spec {
  validateFeatureId(featureId);
  const p = stewardPaths(root);
  getFeature(root, featureId); // must exist
  if (pathExistsSpec(root, featureId)) {
    throw new StateError(
      `spec already exists for feature '${featureId}'; edit spec.md or delete it explicitly first`
    );
  }
  const spec: Spec = SpecConfig.parse({
    featureId,
    objective: input.objective,
    personas: input.personas ?? [],
    expectedBehavior: input.expectedBehavior ?? [],
    constraints: input.constraints ?? [],
    assumptions: input.assumptions ?? [],
    outOfScope: input.outOfScope ?? [],
    acceptanceCriteria: input.acceptanceCriteria ?? [],
    risks: input.risks ?? [],
    openQuestions: input.openQuestions ?? [],
    approved: false,
  });
  writeYaml(p.specMd(featureId).replace(/spec\.md$/, "spec.meta.yaml"), spec);
  writeSpecMarkdown(root, featureId, spec);
  new Ledger(brainPaths(root).ledgerJsonl).append("spec.created", ACTOR, featureId, {
    objective: spec.objective,
  });
  return spec;
}

function pathExistsSpec(root: string, featureId: string): boolean {
  const p = stewardPaths(root);
  return fs.existsSync(p.specMd(featureId));
}

export function readSpec(root: string, featureId: string): Spec | null {
  const p = stewardPaths(root);
  const meta = p.specMd(featureId).replace(/spec\.md$/, "spec.meta.yaml");
  return readYaml(meta, SpecConfig);
}

/** Human-readable spec document mirroring the structured metadata. */
export function writeSpecMarkdown(root: string, featureId: string, spec: Spec): void {
  const p = stewardPaths(root);
  const lines: string[] = [
    `# Spec: ${featureId}`,
    "",
    `Objective: ${spec.objective}`,
    "",
  ];
  const section = (title: string, items: string[]) => {
    if (items.length === 0) return;
    lines.push(`## ${title}`, "", ...items.map((i) => `- ${i}`), "");
  };
  section("Personas", spec.personas);
  section("Expected behavior", spec.expectedBehavior);
  section("Constraints", spec.constraints);
  section("Assumptions", spec.assumptions);
  section("Out of scope", spec.outOfScope);
  section("Acceptance criteria", spec.acceptanceCriteria);
  section("Risks", spec.risks);
  section("Open questions", spec.openQuestions);
  lines.push(
    `Status: ${spec.approved ? "APPROVED" : "DRAFT"}${spec.approvedAt ? ` (${spec.approvedAt})` : ""}`,
    ""
  );
  fs.mkdirSync(p.featureDir(featureId), { recursive: true });
  fs.writeFileSync(p.specMd(featureId), lines.join("\n"), "utf8");
}

export function approveSpec(root: string, featureId: string): { spec: Spec; approved: boolean } {
  const spec = readSpec(root, featureId);
  if (!spec) throw new StateError(`no spec for feature '${featureId}'`);
  if (spec.approved) return { spec, approved: false };
  spec.approved = true;
  spec.approvedAt = nowIso();
  const p = stewardPaths(root);
  writeYaml(p.specMd(featureId).replace(/spec\.md$/, "spec.meta.yaml"), spec);
  writeSpecMarkdown(root, featureId, spec);
  new Ledger(brainPaths(root).ledgerJsonl).append("spec.approved", ACTOR, featureId, {});

  // Spec acceptance drives the lifecycle: PROPOSED → SPECIFIED → APPROVED.
  const feature = getFeature(root, featureId);
  if (feature.state === "PROPOSED") transitionFeature(root, featureId, "SPECIFIED");
  if (getFeature(root, featureId).state === "SPECIFIED") {
    transitionFeature(root, featureId, "APPROVED");
  }
  return { spec, approved: true };
}

export { slugify };
