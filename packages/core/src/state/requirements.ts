import {
  RequirementsFileConfig,
  type Requirement,
  type RequirementStatus,
  type RequirementsFile,
} from "./schema.js";
import {
  StateError,
  nextNumberFor,
  validateFeatureId,
  validateRequirementId,
} from "./ids.js";
import { nowIso, readYaml, writeYaml } from "./store.js";
import { stewardPaths } from "./paths.js";
import { brainPaths } from "../brain/paths.js";
import { Ledger } from "../schema/ledger.js";
import { VERSION } from "../version.js";

const ACTOR = `steward-core@${VERSION}`;

export function addRequirement(
  root: string,
  featureId: string,
  input: {
    id?: string;
    area?: string;
    title: string;
    description?: string;
    priority?: "must" | "should" | "could";
    status?: RequirementStatus;
    source?: string;
    acceptance?: string[];
  }
): Requirement {
  validateFeatureId(featureId);
  const p = stewardPaths(root);
  const file = p.requirementsYaml(featureId);
  const existing: RequirementsFile =
    readYaml(file, RequirementsFileConfig) ??
    { schema: "steward.state.v1", featureId, requirements: [] };

  let id: string;
  if (input.id) {
    id = validateRequirementId(input.id);
  } else {
    const area = (input.area ?? "CORE").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24) || "CORE";
    id = `REQ-${area}-${nextNumberFor(`REQ-${area}`, existing.requirements.map((r) => r.id))}`;
  }

  if (existing.requirements.some((r) => r.id === id)) {
    throw new StateError(
      `duplicate requirement id '${id}'; IDs are stable and immutable — supersede instead`
    );
  }

  const requirement: Requirement = {
    schema: "steward.state.v1",
    id,
    featureId,
    title: input.title,
    description: input.description ?? "",
    status: input.status ?? "proposed",
    priority: input.priority ?? "must",
    source: input.source ?? "feature-spec",
    acceptance: input.acceptance ?? [],
    createdAt: nowIso(),
  };
  existing.requirements.push(requirement);
  writeYaml(file, existing);
  new Ledger(brainPaths(root).ledgerJsonl).append("requirement.created", ACTOR, id, {
    featureId,
    title: requirement.title,
    priority: requirement.priority,
  });
  return requirement;
}

export function readRequirements(root: string, featureId: string): RequirementsFile | null {
  validateFeatureId(featureId);
  return readYaml(stewardPaths(root).requirementsYaml(featureId), RequirementsFileConfig);
}

export function listRequirements(root: string, featureId: string): Requirement[] {
  return readRequirements(root, featureId)?.requirements ?? [];
}

export function getRequirement(root: string, featureId: string, requirementId: string): Requirement {
  const req = listRequirements(root, featureId).find((r) => r.id === requirementId);
  if (!req) {
    throw new StateError(`requirement '${requirementId}' not found in feature '${featureId}'`);
  }
  return req;
}

export function setRequirementStatus(
  root: string,
  featureId: string,
  requirementId: string,
  status: RequirementStatus
): Requirement {
  validateRequirementId(requirementId);
  const p = stewardPaths(root);
  const file = p.requirementsYaml(featureId);
  const data = readYaml(file, RequirementsFileConfig);
  if (!data) throw new StateError(`no requirements for feature '${featureId}'`);
  const req = data.requirements.find((r) => r.id === requirementId);
  if (!req) throw new StateError(`requirement '${requirementId}' not found`);
  req.status = status;
  writeYaml(file, data);
  return req;
}
