import { z } from "zod";

export const STATE_SCHEMA = "steward.state.v1";

// ─── project ─────────────────────────────────────────────────────────────

export const ProjectStateConfig = z.object({
  schema: z.literal(STATE_SCHEMA).default(STATE_SCHEMA),
  name: z.string().min(1).max(120),
  description: z.string().default(""),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  /** Deterministic verification commands, overriding discovery. */
  verification: z
    .object({
      test: z.string().optional(),
      typecheck: z.string().optional(),
      lint: z.string().optional(),
      build: z.string().optional(),
    })
    .default({}),
  /** Current milestone label, if any. */
  milestone: z.string().optional(),
});

export type ProjectState = z.infer<typeof ProjectStateConfig>;

// ─── feature lifecycle ───────────────────────────────────────────────────

export const FEATURE_STATES = [
  "PROPOSED",
  "SPECIFIED",
  "APPROVED",
  "PLANNED",
  "IMPLEMENTING",
  "VERIFYING",
  "COMPLETE",
  "BLOCKED",
  "REJECTED",
  "CANCELLED",
] as const;
export type FeatureState = (typeof FEATURE_STATES)[number];

export const FeatureConfig = z.object({
  schema: z.literal(STATE_SCHEMA).default(STATE_SCHEMA),
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  state: z.enum(FEATURE_STATES),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  /** Deterministic risk classification (LOW|MEDIUM|HIGH|CRITICAL). */
  risk: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("LOW"),
  /** Extra risk observations supplied by the agent (policy still governs). */
  riskNotes: z.array(z.string()).default([]),
  /** Which mandatory gates apply beyond the universal ones. */
  requiredGates: z
    .array(z.enum(["test", "typecheck", "lint", "build", "browserQA", "securityReview"]))
    .default([]),
  /** Free-form request text the feature originated from. */
  request: z.string().default(""),
});

export type Feature = z.infer<typeof FeatureConfig>;

// ─── spec ────────────────────────────────────────────────────────────────

export const SpecConfig = z.object({
  schema: z.literal(STATE_SCHEMA).default(STATE_SCHEMA),
  featureId: z.string().min(1),
  objective: z.string().min(1),
  personas: z.array(z.string()).default([]),
  expectedBehavior: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  outOfScope: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
  approved: z.boolean().default(false),
  approvedAt: z.string().optional(),
});

export type Spec = z.infer<typeof SpecConfig>;

// ─── requirements ────────────────────────────────────────────────────────

export const REQUIREMENT_STATUSES = [
  "proposed",
  "accepted",
  "rejected",
  "superseded",
] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

export const RequirementConfig = z.object({
  schema: z.literal(STATE_SCHEMA).default(STATE_SCHEMA),
  id: z.string().min(1),
  featureId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().default(""),
  status: z.enum(REQUIREMENT_STATUSES).default("proposed"),
  priority: z.enum(["must", "should", "could"]).default("must"),
  source: z.string().default("feature-spec"),
  acceptance: z.array(z.string()).default([]),
  createdAt: z.string().min(1),
});

export type Requirement = z.infer<typeof RequirementConfig>;

export const RequirementsFileConfig = z.object({
  schema: z.literal(STATE_SCHEMA).default(STATE_SCHEMA),
  featureId: z.string().min(1),
  requirements: z.array(RequirementConfig).default([]),
});

export type RequirementsFile = z.infer<typeof RequirementsFileConfig>;

// ─── tasks ───────────────────────────────────────────────────────────────

export const TASK_STATES = [
  "PENDING",
  "READY",
  "IN_PROGRESS",
  "BLOCKED",
  "VERIFYING",
  "DONE",
] as const;
export type TaskState = (typeof TASK_STATES)[number];

export const TaskConfig = z.object({
  schema: z.literal(STATE_SCHEMA).default(STATE_SCHEMA),
  id: z.string().min(1),
  featureId: z.string().min(1),
  objective: z.string().min(1).max(400),
  requirements: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  expectedFiles: z.array(z.string()).default([]),
  implementationNotes: z.array(z.string()).default([]),
  testExpectations: z.array(z.string()).default([]),
  /** Deterministic verification commands for this task (executed, not promised). */
  verification: z.array(z.string()).default([]),
  risk: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("LOW"),
  status: z.enum(TASK_STATES).default("PENDING"),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export type Task = z.infer<typeof TaskConfig>;

export const PlanConfig = z.object({
  schema: z.literal(STATE_SCHEMA).default(STATE_SCHEMA),
  featureId: z.string().min(1),
  createdAt: z.string().min(1),
  taskOrder: z.array(z.string()).default([]),
});

export type Plan = z.infer<typeof PlanConfig>;

// ─── review ──────────────────────────────────────────────────────────────

export const ReviewSeverities = ["BLOCKER", "WARNING", "NOTE"] as const;

export const ReviewFindingConfig = z.object({
  id: z.string().min(1),
  requirement: z.string().optional(),
  file: z.string().default(""),
  issue: z.string().min(1),
  severity: z.enum(ReviewSeverities),
});

export type ReviewFinding = z.infer<typeof ReviewFindingConfig>;

export const ReviewConfig = z.object({
  schema: z.literal(STATE_SCHEMA).default(STATE_SCHEMA),
  featureId: z.string().min(1),
  reviewedAt: z.string().min(1),
  scope: z.string().default(""),
  findings: z.array(ReviewFindingConfig).default([]),
});

export type Review = z.infer<typeof ReviewConfig>;

// ─── debug ───────────────────────────────────────────────────────────────

export const DEBUG_STAGES = [
  "REPRODUCE",
  "HYPOTHESES",
  "EVIDENCE",
  "ROOT_CAUSE",
  "REGRESSION_TEST",
  "FIX",
  "VERIFY",
] as const;
export type DebugStage = (typeof DEBUG_STAGES)[number];

export const DebugSessionConfig = z.object({
  schema: z.literal(STATE_SCHEMA).default(STATE_SCHEMA),
  id: z.string().min(1),
  featureId: z.string().optional(),
  symptom: z.string().min(1),
  stage: z.enum(DEBUG_STAGES).default("REPRODUCE"),
  reproduction: z.string().default(""),
  hypotheses: z.array(z.string()).default([]),
  evidenceNotes: z.array(z.string()).default([]),
  rootCause: z.string().default(""),
  regressionTest: z.string().default(""),
  resolution: z.string().default(""),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export type DebugSession = z.infer<typeof DebugSessionConfig>;

// ─── baseline ────────────────────────────────────────────────────────────

export const BaselineConfig = z.object({
  schema: z.literal(STATE_SCHEMA).default(STATE_SCHEMA),
  capturedAt: z.string().min(1),
  revision: z.string().default(""),
  /** Pre-existing modified/untracked paths (Steward does not own these). */
  dirtyPaths: z.array(z.string()).default([]),
  /** Pre-existing failing verification commands and their output summaries. */
  failing: z
    .array(
      z.object({
        command: z.string(),
        exitCode: z.number().int(),
        summary: z.string().default(""),
      })
    )
    .default([]),
});

export type Baseline = z.infer<typeof BaselineConfig>;
