import {
  getFeature,
  listFeatures,
} from "./state/features.js";
import { getTask, listTasks } from "./state/tasks.js";
import { getRequirement, listRequirements } from "./state/requirements.js";
import { readReview } from "./state/review.js";
import { readBaseline } from "./baseline.js";
import { resolveCommands } from "./verification/commands.js";
import { StateError, validateTaskId } from "./state/ids.js";

/**
 * Context packs: the minimal, deterministic context an agent needs to work
 * on one task or feature. Never a dump of the whole state directory.
 */

export interface ContextPack {
  title: string;
  markdown: string;
}

export function contextForTask(root: string, taskId: string): ContextPack {
  validateTaskId(taskId);
  const feature = listFeatures(root).find((f) =>
    listTasks(root, f.id).some((t) => t.id === taskId)
  );
  if (!feature) throw new StateError(`task '${taskId}' not found in any feature`);

  const task = getTask(root, feature.id, taskId);
  const requirements = task.requirements.map((rid) => {
    try {
      return getRequirement(root, feature.id, rid);
    } catch {
      return null;
    }
  });
  const review = readReview(root, feature.id);
  const blockers = review?.findings.filter((f) => f.severity === "BLOCKER") ?? [];
  const { commands } = resolveCommands(root);
  const baseline = readBaseline(root);

  const lines: string[] = [
    `# Context pack: ${task.id} — ${task.objective}`,
    "",
    `Feature: ${feature.id} (${feature.title}) — state ${feature.state}, risk ${feature.risk}`,
    "",
    "## Task",
    "",
    `- status: ${task.status} (readiness derived from dependencies)`,
    ...(task.expectedFiles.length ? [`- expected files: ${task.expectedFiles.join(", ")}`] : []),
    ...(task.testExpectations.length ? [`- test expectations:`, ...task.testExpectations.map((t) => `  - ${t}`)] : []),
    ...(task.verification.length ? [`- verification (must pass before DONE):`, ...task.verification.map((v) => `  - ${v}`)] : []),
    "",
    "## Requirements served",
    "",
  ];
  if (requirements.filter(Boolean).length === 0) {
    lines.push("- (none — every task must trace to at least one requirement)");
  }
  for (const r of requirements) {
    if (!r) continue;
    lines.push(`### ${r.id}: ${r.title}`, "", r.description, "");
    if (r.acceptance.length) lines.push(...r.acceptance.map((a) => `- [ ] ${a}`), "");
  }
  if (task.dependencies.length) {
    lines.push("## Dependencies", "", ...task.dependencies.map((d) => `- ${d}`), "");
  }
  lines.push("## Project verification commands", "");
  for (const c of commands) lines.push(`- ${c.category}: ${c.command}`);
  if (blockers.length) {
    lines.push("", "## Known blockers", "", ...blockers.map((b) => `- [${b.severity}] ${b.id}: ${b.issue}`));
  }
  if (baseline && baseline.dirtyPaths.length > 0) {
    lines.push(
      "",
      "## Protected working-tree changes",
      "",
      "These pre-existing user changes are NOT yours to modify or discard:",
      "",
      ...baseline.dirtyPaths.map((p) => `- ${p}`)
    );
  }
  return { title: `${task.id} (${feature.id})`, markdown: lines.join("\n") };
}

export function contextForFeature(root: string, featureId: string): ContextPack {
  const feature = getFeature(root, featureId);
  const requirements = listRequirements(root, featureId);
  const tasks = listTasks(root, featureId);
  const { commands } = resolveCommands(root);
  const lines: string[] = [
    `# Context pack: feature ${feature.id} — ${feature.title}`,
    "",
    `State: ${feature.state}   Risk: ${feature.risk}   Gates: ${feature.requiredGates.join(", ") || "universal only"}`,
    "",
    "## Requirements",
    "",
    ...requirements.map((r) => `- [${r.status}] ${r.id} (${r.priority}): ${r.title}`),
    "",
    "## Tasks",
    "",
    ...(tasks.length
      ? tasks.map((t) => `- [${t.status}] ${t.id}: ${t.objective}`)
      : ["- (none planned)"]),
    "",
    "## Project verification commands",
    "",
    ...commands.map((c) => `- ${c.category}: ${c.command}`),
  ];
  return { title: feature.id, markdown: lines.join("\n") };
}
