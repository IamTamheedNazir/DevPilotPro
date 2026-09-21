import * as fs from "node:fs";
import {
  PlanConfig,
  TaskConfig,
  type Plan,
  type Task,
  type TaskState,
} from "./schema.js";
import {
  StateError,
  nextNumberFor,
  validateFeatureId,
  validateTaskId,
} from "./ids.js";
import { nowIso, readYaml, writeYaml } from "./store.js";
import { stewardPaths } from "./paths.js";
import { brainPaths } from "../brain/paths.js";
import { Ledger } from "../schema/ledger.js";
import { VERSION } from "../version.js";
import { listRequirements } from "./requirements.js";
import { getFeature, transitionFeature } from "./features.js";
import { pathExists } from "../util/fs.js";

const ACTOR = `steward-core@${VERSION}`;

export interface AddTaskInput {
  objective: string;
  requirements?: string[];
  dependencies?: string[];
  expectedFiles?: string[];
  implementationNotes?: string[];
  testExpectations?: string[];
  verification?: string[];
  risk?: Task["risk"];
}

export function addTask(root: string, featureId: string, input: AddTaskInput): Task {
  validateFeatureId(featureId);
  const p = stewardPaths(root);
  const existing = listTasks(root, featureId);
  const id = `TASK-${nextNumberFor("TASK", existing.map((t) => t.id))}`;

  // Traceability is validated at write time: every referenced requirement
  // must exist in this feature, every dependency must be a real task.
  const knownReqs = new Set(listRequirements(root, featureId).map((r) => r.id));
  for (const reqId of input.requirements ?? []) {
    if (!knownReqs.has(reqId)) {
      throw new StateError(
        `task references unknown requirement '${reqId}'; add it first (tasks must trace to requirements)`
      );
    }
  }
  const knownTasks = new Set(existing.map((t) => t.id));
  for (const dep of input.dependencies ?? []) {
    if (!knownTasks.has(dep)) {
      throw new StateError(`task depends on unknown task '${dep}'`);
    }
  }

  const task: Task = TaskConfig.parse({
    id,
    featureId,
    objective: input.objective,
    requirements: input.requirements ?? [],
    dependencies: input.dependencies ?? [],
    expectedFiles: input.expectedFiles ?? [],
    implementationNotes: input.implementationNotes ?? [],
    testExpectations: input.testExpectations ?? [],
    verification: input.verification ?? [],
    risk: input.risk ?? "LOW",
    status: "PENDING",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  fs.mkdirSync(p.tasksDir(featureId), { recursive: true });
  writeYaml(p.taskYaml(featureId, id), task);
  new Ledger(brainPaths(root).ledgerJsonl).append("task.created", ACTOR, id, {
    featureId,
    requirements: task.requirements,
  });
  return task;
}

export function listTasks(root: string, featureId: string): Task[] {
  validateFeatureId(featureId);
  const dir = stewardPaths(root).tasksDir(featureId);
  if (!pathExists(dir)) return [];
  const tasks: Task[] = [];
  for (const entry of fs.readdirSync(dir).sort()) {
    if (!entry.endsWith(".yaml")) continue;
    const task = readYaml(`${dir}/${entry}`, TaskConfig);
    if (task) tasks.push(task);
  }
  return tasks;
}

export function getTask(root: string, featureId: string, taskId: string): Task {
  validateTaskId(taskId);
  const task = listTasks(root, featureId).find((t) => t.id === taskId);
  if (!task) throw new StateError(`task '${taskId}' not found in feature '${featureId}'`);
  return task;
}

function persist(root: string, task: Task): void {
  const p = stewardPaths(root);
  writeYaml(p.taskYaml(task.featureId, task.id), { ...task, updatedAt: nowIso() });
}

/**
 * A task is READY when all of its dependencies are DONE. PENDING otherwise.
 * Derived, never stored as authority.
 */
export function readinessOf(task: Task, allTasks: Task[]): Task["status"] {
  if (task.status === "BLOCKED") return "BLOCKED";
  const byId = new Map(allTasks.map((t) => [t.id, t]));
  for (const dep of task.dependencies) {
    const d = byId.get(dep);
    if (!d) return "BLOCKED";
    if (d.status !== "DONE") return "PENDING";
  }
  return task.status === "PENDING" ? "READY" : task.status;
}

export function startTask(root: string, featureId: string, taskId: string): Task {
  const task = getTask(root, featureId, taskId);
  const feature = getFeature(root, featureId);
  if (feature.state !== "PLANNED" && feature.state !== "IMPLEMENTING") {
    throw new StateError(
      `cannot start tasks while feature is ${feature.state}; accept spec, plan, then build`
    );
  }
  if (task.status === "DONE") throw new StateError(`task '${taskId}' is already DONE`);
  const readiness = readinessOf(task, listTasks(root, featureId));
  if (readiness === "PENDING") {
    throw new StateError(`task '${taskId}' is not READY: dependencies not DONE yet`);
  }
  task.status = "IN_PROGRESS";
  persist(root, task);
  new Ledger(brainPaths(root).ledgerJsonl).append("task.started", ACTOR, taskId, { featureId });
  if (feature.state === "PLANNED") {
    transitionFeature(root, featureId, "IMPLEMENTING");
  }
  return task;
}

export function blockTask(root: string, featureId: string, taskId: string, reason: string): Task {
  const task = getTask(root, featureId, taskId);
  task.status = "BLOCKED";
  task.implementationNotes.push(`BLOCKED: ${reason}`);
  persist(root, task);
  new Ledger(brainPaths(root).ledgerJsonl).append("task.status", ACTOR, taskId, {
    featureId,
    status: "BLOCKED",
    reason,
  });
  return task;
}

/**
 * Mark a task DONE. Deterministic gate: every verification command in the
 * task must have a recorded PASSING execution (evidence event). A builder
 * saying "done" is not evidence.
 */
export function completeTask(root: string, featureId: string, taskId: string): Task {
  const task = getTask(root, featureId, taskId);
  if (task.status === "DONE") return task;
  const ledger = new Ledger(brainPaths(root).ledgerJsonl);
  for (const command of task.verification) {
    const passing = ledger
      .records()
      .some(
        (r) =>
          r.kind === "verification.run" &&
          r.payload?.["featureId"] === featureId &&
          r.payload?.["taskId"] === taskId &&
          r.payload?.["command"] === command &&
          r.payload?.["success"] === true
      );
    if (!passing) {
      throw new StateError(
        `task '${taskId}' cannot be DONE: verification command has no passing evidence record: ${command} — run 'steward task verify'`
      );
    }
  }
  task.status = "DONE";
  persist(root, task);
  ledger.append("task.status", ACTOR, taskId, { featureId, status: "DONE" });
  return task;
}

export function setTaskStatus(root: string, featureId: string, taskId: string, status: TaskState): Task {
  const task = getTask(root, featureId, taskId);
  if (status === "DONE") return completeTask(root, featureId, taskId);
  task.status = status;
  persist(root, task);
  new Ledger(brainPaths(root).ledgerJsonl).append("task.status", ACTOR, taskId, {
    featureId,
    status,
  });
  return task;
}

// ─── plan ────────────────────────────────────────────────────────────────

export function createPlan(root: string, featureId: string, order?: string[]): Plan {
  const feature = getFeature(root, featureId);
  if (feature.state !== "APPROVED" && feature.state !== "PLANNED") {
    throw new StateError(
      `plan requires an APPROVED spec; feature is ${feature.state}`
    );
  }
  const tasks = listTasks(root, featureId);
  if (tasks.length === 0) {
    throw new StateError("plan requires at least one task; add tasks first");
  }
  const taskIds = new Set(tasks.map((t) => t.id));
  const requested = order ?? tasks.map((t) => t.id);
  for (const id of requested) {
    if (!taskIds.has(id)) throw new StateError(`plan references unknown task '${id}'`);
  }
  const plan: Plan = PlanConfig.parse({
    featureId,
    createdAt: nowIso(),
    taskOrder: requested,
  });
  writeYaml(stewardPaths(root).planYaml(featureId), plan);
  new Ledger(brainPaths(root).ledgerJsonl).append("plan.created", ACTOR, featureId, {
    tasks: requested.length,
  });
  // Planning is a lifecycle milestone: APPROVED → PLANNED.
  if (getFeature(root, featureId).state === "APPROVED") {
    transitionFeature(root, featureId, "PLANNED");
  }
  return plan;
}

export function readPlan(root: string, featureId: string): Plan | null {
  validateFeatureId(featureId);
  return readYaml(stewardPaths(root).planYaml(featureId), PlanConfig);
}
