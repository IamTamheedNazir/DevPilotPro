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
import { retrieveMemories, formatMemoryBlock } from "./memory/retrieval.js";
import { latestHandoff } from "./memory/handoff-store.js";
import { acceptedConventions } from "./memory/guardian-bridge.js";

/**
 * Context packs: the minimal, deterministic context an agent needs to work
 * on one task or feature. Never a dump of the whole state directory.
 *
 * Context Pack V2 (Phase 5): packs now carry the governing project memory
 * (authority-ranked, budgeted) and the latest handoff, so any harness picks
 * up the same durable truth — conversation history is never required.
 */

export interface ContextPack {
  title: string;
  markdown: string;
}

/**
 * Shared V2 sections: governing memory relevant to the task/feature, plus a
 * compact pointer to the latest handoff. Bounded so packs stay small.
 */
function contextPackV2Sections(
  root: string,
  opts: { files: string[]; featureId?: string; taskText: string }
): string {
  const parts: string[] = [];
  try {
    const retrieved = retrieveMemories(root, {
      text: opts.taskText,
      files: opts.files,
      featureId: opts.featureId,
      limit: 8,
    });
    const block = formatMemoryBlock(retrieved, 3000);
    if (block) parts.push(block);
  } catch {
    /* memory unavailable (fresh project) — packs degrade gracefully */
  }
  try {
    const handoff = latestHandoff(root, opts.featureId);
    if (handoff) {
      parts.push(
        [
          "## Latest handoff",
          "",
          `- ${handoff.id} from ${handoff.fromHarness} (${handoff.fromSession}) at ${handoff.createdAt}`,
          ...(handoff.remaining.length ? handoff.remaining.slice(0, 5).map((r) => `- remaining: ${r}`) : []),
          ...(handoff.warnings.length ? handoff.warnings.slice(0, 3).map((w) => `- warning: ${w}`) : []),
          "",
        ].join("\n")
      );
    }
  } catch {
    /* handoffs unavailable */
  }
  try {
    const conventions = acceptedConventions(root, opts.featureId);
    if (conventions.length > 0) {
      parts.push(
        [
          "## Accepted conventions (binding)",
          "",
          ...conventions.slice(0, 6).map((c) => `- ${c.statement} (${c.id})`),
          "",
        ].join("\n")
      );
    }
  } catch {
    /* conventions unavailable */
  }
  return parts.join("");
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
  // Context Pack V2: governing memory + handoff + accepted conventions.
  const v2 = contextPackV2Sections(root, {
    files: task.expectedFiles.map((f) => f.replace(/\\/g, "/")),
    featureId: feature.id,
    taskText: `${task.objective} ${requirements.filter(Boolean).map((r) => (r ? `${r.title} ${r.description}` : "")).join(" ")}`,
  });
  if (v2) lines.push("", v2);
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
  // Context Pack V2: governing memory + handoff + accepted conventions.
  const v2 = contextPackV2Sections(root, {
    files: [],
    featureId,
    taskText: `${feature.title} ${requirements.map((r) => r.title).join(" ")}`,
  });
  if (v2) lines.push("", v2);
  return { title: feature.id, markdown: lines.join("\n") };
}
