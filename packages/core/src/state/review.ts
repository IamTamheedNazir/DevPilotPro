import {
  ReviewConfig,
  type Review,
  type ReviewFinding,
} from "./schema.js";
import {
  nextNumberFor,
  StateError,
  validateFeatureId,
  validateReviewId,
} from "./ids.js";
import { nowIso, readYaml, writeYaml } from "./store.js";
import { stewardPaths } from "./paths.js";
import { brainPaths } from "../brain/paths.js";
import { Ledger } from "../schema/ledger.js";
import { VERSION } from "../version.js";
import { pathExists } from "../util/fs.js";

const ACTOR = `steward-core@${VERSION}`;

export function addFindings(
  root: string,
  featureId: string,
  input: { scope: string; findings: Array<Omit<ReviewFinding, "id">> }
): Review {
  validateFeatureId(featureId);
  const p = stewardPaths(root);
  const existing: Review =
    readYaml(p.reviewYaml(featureId), ReviewConfig) ??
    { schema: "steward.state.v1", featureId, reviewedAt: nowIso(), scope: input.scope, findings: [] };
  existing.reviewedAt = nowIso();
  existing.scope = input.scope;

  for (const finding of input.findings) {
    const id = `REV-${nextNumberFor("REV", existing.findings.map((f) => f.id))}`;
    existing.findings.push({ ...finding, id });
    new Ledger(brainPaths(root).ledgerJsonl).append("review.recorded", ACTOR, id, {
      featureId,
      severity: finding.severity,
      requirement: finding.requirement ?? null,
      file: finding.file,
    });
  }
  writeYaml(p.reviewYaml(featureId), existing);
  return existing;
}

export function readReview(root: string, featureId: string): Review | null {
  validateFeatureId(featureId);
  const p = stewardPaths(root);
  if (!pathExists(p.reviewYaml(featureId))) return null;
  return readYaml(p.reviewYaml(featureId), ReviewConfig);
}

export function resolveFinding(root: string, featureId: string, findingId: string): Review {
  validateReviewId(findingId);
  const p = stewardPaths(root);
  const review = readYaml(p.reviewYaml(featureId), ReviewConfig);
  if (!review) throw new StateError(`no review findings for feature '${featureId}'`);
  const finding = review.findings.find((f) => f.id === findingId);
  if (!finding) throw new StateError(`finding '${findingId}' not found`);
  review.findings = review.findings.filter((f) => f.id !== findingId);
  writeYaml(p.reviewYaml(featureId), review);
  return review;
}

export function openBlockers(review: Review | null): ReviewFinding[] {
  return review?.findings.filter((f) => f.severity === "BLOCKER") ?? [];
}
