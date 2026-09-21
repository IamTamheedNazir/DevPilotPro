import { readYaml, writeYaml } from "../state/store.js";
import { stewardPaths } from "../state/paths.js";
import { pathExists } from "../util/fs.js";
import {
  SecurityPolicyConfig,
  QaPolicyConfig,
  DEFAULT_SECURITY_POLICY,
  DEFAULT_QA_POLICY,
  type SecurityPolicy,
  type QaPolicy,
} from "./schema.js";
import type { ProjectState } from "../state/schema.js";
import { ProjectStateConfig } from "../state/schema.js";

/**
 * Project security/QA policy (§57, §58): small and understandable. Policy
 * lives in `.steward/project.yaml` under `security:` and `qa:` keys. Missing
 * keys fall back to defaults; invalid blocks fall back to defaults too so a
 * typo can never brick the Guardian.
 */

export function readProjectStateTolerant(root: string): ProjectState | null {
  const file = stewardPaths(root).projectYaml;
  if (!pathExists(file)) return null;
  try {
    return readYaml(file, ProjectStateConfig);
  } catch {
    return null;
  }
}

export function readSecurityPolicy(root: string): SecurityPolicy {
  const state = readProjectStateTolerant(root);
  if (!state) return DEFAULT_SECURITY_POLICY;
  try {
    return SecurityPolicyConfig.parse((state as unknown as { security?: unknown }).security ?? {});
  } catch {
    return DEFAULT_SECURITY_POLICY;
  }
}

export function readQaPolicy(root: string): QaPolicy {
  const state = readProjectStateTolerant(root);
  if (!state) return DEFAULT_QA_POLICY;
  try {
    return QaPolicyConfig.parse((state as unknown as { qa?: unknown }).qa ?? {});
  } catch {
    return DEFAULT_QA_POLICY;
  }
}

export function saveSecurityPolicy(root: string, policy: SecurityPolicy): void {
  const state = readProjectStateTolerant(root);
  const base = state ? (state as unknown as Record<string, unknown>) : {};
  writeYaml(stewardPaths(root).projectYaml, { ...base, security: policy });
}

export function saveQaPolicy(root: string, policy: QaPolicy): void {
  const state = readProjectStateTolerant(root);
  const base = state ? (state as unknown as Record<string, unknown>) : {};
  writeYaml(stewardPaths(root).projectYaml, { ...base, qa: policy });
}
