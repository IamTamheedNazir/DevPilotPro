import type { Command } from "commander";
import {
  completeFeature,
  createDebugSession,
  createFeature,
  createPlan,
  createSpec,
  advanceDebugStage,
  addFindings,
  addRequirement,
  addTask,
  captureBaseline,
  contextForFeature,
  contextForTask,
  DEBUG_STAGES,
  evidenceFor,
  type Feature,
  getFeature,
  listFeatures,
  listRequirements,
  listTasks,
  refreshRisk,
  readBaseline,
  readPlan,
  readReview,
  recordReviewVerdict,
  resolveFinding,
  runTaskVerification,
  runVerification,
  setRequirementStatus,
  setTaskStatus,
  startTask,
  blockTask,
  transitionFeature,
  type TaskState,
  type VerificationEvaluation,
  type EngineRiskLevel,
  // Phase 3: repository intelligence + guardian
  buildIndex,
  ensureIndex,
  buildDependencyMap,
  dependenciesOf,
  dependentsOf,
  associatedTests,
  toProjectRelative,
  impactOfChangedFiles,
  workingTreeChanges,
  retrieveContext,
  guardFeature,
  guardAll,
  reviewDiff,
  debugContext,
  checkFreshness,
} from "@steward/core";
import { out } from "./format.js";

function emit(data: unknown, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function fail(err: Error): never {
  console.error(`\n  ${out.red("✖")} ${err.message}\n`);
  process.exitCode = 1;
  throw err;
}

function printGates(evaluation: VerificationEvaluation): void {
  console.log(`\n  ${out.bold("STEWARD VERIFICATION")} — feature ${evaluation.featureId}\n`);
  for (const gate of evaluation.gates) {
    const icon =
      gate.status === "PASS"
        ? out.green("PASS")
        : gate.status === "FAIL"
          ? out.red("FAIL")
          : gate.status === "MISSING"
            ? out.yellow("MISSING")
            : out.dim("NOT REQ");
    console.log(`  ${icon.padEnd(9)} ${gate.title.padEnd(36)} ${out.dim(gate.detail)}`);
  }
  const verdict =
    evaluation.verdict.verdict === "COMPLETE_ELIGIBLE"
      ? out.green("COMPLETE ELIGIBLE")
      : out.red("NOT COMPLETE");
  console.log(`\n  STATUS: ${verdict}`);
  for (const remaining of evaluation.verdict.remainingGates) {
    console.log(`  ${out.yellow("↳")} ${remaining}`);
  }
  console.log("");
}

export function registerWorkflowCommands(program: Command): void {
  const feature = program
    .command("feature")
    .description("Feature lifecycle: propose, specify, plan, implement, verify, complete");

  feature
    .command("create")
    .description("Create a feature in PROPOSED state (deterministic risk classification runs on creation)")
    .argument("<title>", "Feature title (also used to derive the feature id)")
    .option("--id <id>", "Explicit feature id (lowercase kebab)")
    .option("--request <text>", "Original request text (feeds the risk engine)")
    .option("--json", "Machine-readable output", false)
    .action((title: string, opts: { id?: string; request?: string; json: boolean }) => {
      const f = createFeature(process.cwd(), {
        title,
        id: opts.id,
        request: opts.request ?? title,
      });
      if (opts.json) return emit(f, true);
      console.log(`\n  ${out.green("✔")} feature ${out.bold(f.id)} created (state ${f.state}, risk ${f.risk})`);
      console.log(`\n  Next: steward spec new ${f.id} --objective "…"\n`);
    });

  feature
    .command("list")
    .description("List all features")
    .option("--json", "Machine-readable output", false)
    .action((opts: { json: boolean }) => {
      const features = listFeatures(process.cwd());
      if (opts.json) return emit(features, true);
      console.log("");
      for (const f of features) {
        console.log(`  ${f.id.padEnd(28)} ${f.state.padEnd(12)} risk=${f.risk.padEnd(8)} ${f.title}`);
      }
      if (features.length === 0) console.log(out.dim("  (no features)"));
      console.log("");
    });

  feature
    .command("show")
    .description("Show one feature with requirements, tasks, and gates")
    .argument("<id>", "Feature id")
    .option("--json", "Machine-readable output", false)
    .action((id: string, opts: { json: boolean }) => {
      const root = process.cwd();
      const f = getFeature(root, id);
      const data = {
        feature: f,
        requirements: listRequirements(root, id),
        tasks: listTasks(root, id),
        plan: readPlan(root, id),
        review: readReview(root, id),
      };
      if (opts.json) return emit(data, true);
      console.log(`\n  ${out.bold(f.id)} — ${f.title}`);
      console.log(`  state=${f.state} risk=${f.risk} gates=${f.requiredGates.join(",") || "universal"}`);
      console.log(`  requirements: ${data.requirements.length}  tasks: ${data.tasks.length}\n`);
    });

  feature
    .command("transition")
    .description("Apply a lifecycle transition (PROPOSED SPECIFIED APPROVED PLANNED IMPLEMENTING VERIFYING COMPLETE BLOCKED REJECTED CANCELLED)")
    .argument("<id>", "Feature id")
    .argument("<state>", "Target state")
    .option("--json", "Machine-readable output", false)
    .action((id: string, state: string, opts: { json: boolean }) => {
      try {
        const outcome = transitionFeature(process.cwd(), id, state as Feature["state"]);
        if (opts.json) return emit(outcome.feature, true);
        console.log(`\n  ${out.green("✔")} ${id}: ${outcome.feature.state}\n`);
      } catch (err) {
        fail(err as Error);
      }
    });

  feature
    .command("complete")
    .description("Run verification and attempt to complete the feature (gate-enforced)")
    .argument("<id>", "Feature id")
    .option("--json", "Machine-readable output", false)
    .action(async (id: string, opts: { json: boolean }) => {
      try {
        const result = await completeFeature(process.cwd(), id);
        if (opts.json) return emit(result, true);
        printGates(result.evaluation);
        console.log(
          result.completed
            ? `  ${out.green("✔")} feature ${id} is COMPLETE\n`
            : `  ${out.red("✖")} feature ${id} is NOT COMPLETE — remaining gates listed above\n`
        );
        if (!result.completed) process.exitCode = 1;
      } catch (err) {
        fail(err as Error);
      }
    });

  feature
    .command("risk")
    .description("Recompute deterministic risk classification")
    .argument("<id>", "Feature id")
    .option("--note <text>", "Additional risk observation (may raise, never lower)")
    .option("--json", "Machine-readable output", false)
    .action((id: string, opts: { note?: string; json: boolean }) => {
      const result = refreshRisk(process.cwd(), id);
      if (opts.json) return emit(result, true);
      console.log(`\n  ${id}: risk ${result.level}  signals: ${result.signals.join(", ") || "none"}\n`);
      void opts.note;
    });

  // ─── spec ─────────────────────────────────────────────────────────────

  const spec = program.command("spec").description("Feature specifications");

  spec
    .command("new")
    .description("Create a structured spec draft for a feature")
    .argument("<feature>", "Feature id")
    .requiredOption("--objective <text>", "One-sentence objective")
    .option("--behavior <items>", "Expected behavior, comma-separated")
    .option("--constraints <items>", "Constraints, comma-separated")
    .option("--assumptions <items>", "Assumptions, comma-separated")
    .option("--out-of-scope <items>", "Out of scope, comma-separated")
    .option("--acceptance <items>", "Acceptance criteria, comma-separated")
    .option("--risks <items>", "Risks, comma-separated")
    .option("--open-questions <items>", "Open questions, comma-separated")
    .option("--json", "Machine-readable output", false)
    .action((featureId: string, opts: Record<string, string | undefined | boolean> & { json: boolean }) => {
      try {
        const list = (v?: string) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
        const s = createSpec(process.cwd(), featureId, {
          objective: opts.objective as string,
          expectedBehavior: list(opts.behavior as string),
          constraints: list(opts.constraints as string),
          assumptions: list(opts.assumptions as string),
          outOfScope: list(opts.outOfScope as string),
          acceptanceCriteria: list(opts.acceptance as string),
          risks: list(opts.risks as string),
          openQuestions: list(opts.openQuestions as string),
        });
        if (opts.json) return emit(s, true);
        console.log(`\n  ${out.green("✔")} spec draft created for ${featureId}`);
        console.log(`  Next: review spec.md, then steward spec accept ${featureId}\n`);
      } catch (err) {
        fail(err as Error);
      }
    });

  spec
    .command("accept")
    .description("Accept a feature's spec (transitions SPECIFIED → APPROVED)")
    .argument("<feature>", "Feature id")
    .option("--json", "Machine-readable output", false)
    .action((featureId: string, opts: { json: boolean }) => {
      try {
        approveSpecFlow(featureId, opts.json);
      } catch (err) {
        fail(err as Error);
      }
    });

  // ─── requirements ─────────────────────────────────────────────────────

  const requirement = program.command("requirement").description("Requirement management");

  requirement
    .command("add")
    .description("Add a requirement (stable ID: REQ-<AREA>-NNN)")
    .argument("<feature>", "Feature id")
    .requiredOption("--title <text>", "Requirement title")
    .option("--area <area>", "Area token for the ID (e.g. INVITE)", "CORE")
    .option("--id <id>", "Explicit requirement ID")
    .option("--description <text>", "Description")
    .option("--priority <p>", "must|should|could", "must")
    .option("--status <s>", "proposed|accepted|rejected|superseded", "proposed")
    .option("--acceptance <items>", "Acceptance criteria, comma-separated")
    .option("--json", "Machine-readable output", false)
    .action((featureId: string, opts: Record<string, string | undefined | boolean> & { json: boolean }) => {
      try {
        const r = addRequirement(process.cwd(), featureId, {
          id: opts.id as string | undefined,
          area: opts.area as string,
          title: opts.title as string,
          description: opts.description as string,
          priority: opts.priority as "must" | "should" | "could",
          status: opts.status as never,
          acceptance: (opts.acceptance as string)?.split(",").map((s) => s.trim()).filter(Boolean),
        });
        if (opts.json) return emit(r, true);
        console.log(`\n  ${out.green("✔")} ${r.id} added (${r.status}, ${r.priority})\n`);
      } catch (err) {
        fail(err as Error);
      }
    });

  program
    .command("requirements")
    .description("List requirements for a feature")
    .argument("<feature>", "Feature id")
    .option("--json", "Machine-readable output", false)
    .action((featureId: string, opts: { json: boolean }) => {
      const reqs = listRequirements(process.cwd(), featureId);
      if (opts.json) return emit(reqs, true);
      console.log("");
      for (const r of reqs) {
        console.log(`  ${r.id.padEnd(18)} [${r.status.padEnd(9)}] (${r.priority.padEnd(6)}) ${r.title}`);
      }
      if (reqs.length === 0) console.log(out.dim("  (none)"));
      console.log("");
    });

  // ─── tasks & plan ─────────────────────────────────────────────────────

  const task = program.command("task").description("Task management");

  task
    .command("add")
    .description("Add a task that traces to requirements")
    .argument("<feature>", "Feature id")
    .requiredOption("--objective <text>", "Task objective")
    .option("--req <ids>", "Comma-separated requirement IDs this task implements")
    .option("--deps <ids>", "Comma-separated dependency task IDs")
    .option("--files <paths>", "Comma-separated expected files")
    .option("--notes <items>", "Implementation notes, comma-separated")
    .option("--tests <items>", "Test expectations, comma-separated")
    .option("--verify <cmds>", "Verification commands, comma-separated (executed before DONE)")
    .option("--risk <level>", "LOW|MEDIUM|HIGH|CRITICAL", "LOW")
    .option("--json", "Machine-readable output", false)
    .action((featureId: string, opts: Record<string, string | undefined | boolean> & { json: boolean }) => {
      try {
        const list = (v?: string) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
        const t = addTask(process.cwd(), featureId, {
          objective: opts.objective as string,
          requirements: list(opts.req as string),
          dependencies: list(opts.deps as string),
          expectedFiles: list(opts.files as string),
          implementationNotes: list(opts.notes as string),
          testExpectations: list(opts.tests as string),
          verification: list(opts.verify as string),
          risk: (opts.risk as EngineRiskLevel) ?? "LOW",
        });
        if (opts.json) return emit(t, true);
        console.log(`\n  ${out.green("✔")} ${t.id} added (${t.requirements.length} requirement link(s))\n`);
      } catch (err) {
        fail(err as Error);
      }
    });

  task
    .command("start")
    .description("Start a READY task (feature transitions to IMPLEMENTING)")
    .argument("<feature>", "Feature id")
    .argument("<taskId>", "Task id")
    .action((featureId: string, taskId: string) => {
      try {
        startTask(process.cwd(), featureId, taskId);
        console.log(`\n  ${out.green("✔")} ${taskId} IN_PROGRESS\n`);
      } catch (err) {
        fail(err as Error);
      }
    });

  task
    .command("verify")
    .description("Execute the task's verification commands and record evidence")
    .argument("<feature>", "Feature id")
    .argument("<taskId>", "Task id")
    .option("--json", "Machine-readable output", false)
    .action(async (featureId: string, taskId: string, opts: { json: boolean }) => {
      try {
        const result = await runTaskVerification(process.cwd(), featureId, taskId);
        if (opts.json) return emit(result, true);
        for (const e of result.executions) {
          console.log(`  ${e.success ? out.green("PASS") : out.red("FAIL")}  ${e.command} (exit ${e.exitCode})`);
        }
        console.log(`\n  ${result.done ? out.green("✔") : out.red("✖")} ${taskId} ${result.done ? "DONE (evidence recorded)" : "NOT done — failing verification above"}\n`);
        if (!result.done) process.exitCode = 1;
      } catch (err) {
        fail(err as Error);
      }
    });

  task
    .command("done")
    .description("Mark a task DONE (only possible with passing verification evidence)")
    .argument("<feature>", "Feature id")
    .argument("<taskId>", "Task id")
    .action((featureId: string, taskId: string) => {
      try {
        setTaskStatus(process.cwd(), featureId, taskId, "DONE");
        console.log(`\n  ${out.green("✔")} ${taskId} DONE\n`);
      } catch (err) {
        fail(err as Error);
      }
    });

  task
    .command("block")
    .description("Mark a task BLOCKED with a reason")
    .argument("<feature>", "Feature id")
    .argument("<taskId>", "Task id")
    .requiredOption("--reason <text>", "Why it is blocked")
    .action((featureId: string, taskId: string, opts: { reason: string }) => {
      try {
        blockTask(process.cwd(), featureId, taskId, opts.reason);
        console.log(`\n  ${out.yellow("▲")} ${taskId} BLOCKED\n`);
      } catch (err) {
        fail(err as Error);
      }
    });

  program
    .command("tasks")
    .description("List tasks for a feature (with derived readiness)")
    .argument("<feature>", "Feature id")
    .option("--json", "Machine-readable output", false)
    .action((featureId: string, opts: { json: boolean }) => {
      const root = process.cwd();
      const tasks = listTasks(root, featureId);
      const data = tasks.map((t) => ({
        ...t,
        readiness: readiness(root, featureId, t.id),
      }));
      if (opts.json) return emit(data, true);
      console.log("");
      for (const t of data) {
        console.log(`  ${t.id} [${t.status}] ready=${t.readiness.padEnd(12)} ${t.objective}`);
      }
      if (tasks.length === 0) console.log(out.dim("  (none)"));
      console.log("");
    });

  program
    .command("plan")
    .description("Create the implementation plan (requires accepted spec; transitions APPROVED → PLANNED)")
    .argument("<feature>", "Feature id")
    .option("--order <ids>", "Comma-separated task execution order")
    .option("--json", "Machine-readable output", false)
    .action((featureId: string, opts: { order?: string; json: boolean }) => {
      try {
        const plan = createPlan(process.cwd(), featureId, opts.order?.split(",").map((s) => s.trim()));
        if (opts.json) return emit(plan, true);
        console.log(`\n  ${out.green("✔")} plan created (${plan.taskOrder.length} tasks); feature is PLANNED\n`);
      } catch (err) {
        fail(err as Error);
      }
    });

  // ─── verify / evidence / baseline / context ───────────────────────────

  program
    .command("verify")
    .description("Execute project verification commands and evaluate Definition-of-Done gates")
    .argument("<feature>", "Feature id")
    .option("--json", "Machine-readable output", false)
    .action(async (featureId: string, opts: { json: boolean }) => {
      try {
        const { executions, evaluation } = await runVerification(process.cwd(), featureId);
        if (opts.json) return emit({ executions, evaluation }, true);
        for (const e of executions) {
          console.log(`  ${e.success ? out.green("PASS") : out.red("FAIL")}  [${e.category}] ${e.command} (exit ${e.exitCode})`);
        }
        printGates(evaluation);
        if (evaluation.verdict.verdict !== "COMPLETE_ELIGIBLE") process.exitCode = 1;
      } catch (err) {
        fail(err as Error);
      }
    });

  program
    .command("evidence")
    .description("Show the evidence trail for a feature")
    .argument("<feature>", "Feature id")
    .option("--json", "Machine-readable output", false)
    .action((featureId: string, opts: { json: boolean }) => {
      const records = evidenceFor(process.cwd(), featureId);
      if (opts.json) return emit(records, true);
      console.log("");
      for (const r of records) {
        console.log(`  #${String(r.seq).padStart(3, "0")} ${r.ts}  ${r.kind.padEnd(20)} ${r.ref ?? ""}`);
      }
      if (records.length === 0) console.log(out.dim("  (no evidence)"));
      console.log("");
    });

  program
    .command("baseline")
    .description("Show or capture the pre-work baseline (dirty paths, pre-existing failures)")
    .option("--capture", "Capture a new baseline now", false)
    .option("--json", "Machine-readable output", false)
    .action(async (opts: { capture: boolean; json: boolean }) => {
      const baseline = opts.capture
        ? await captureBaseline(process.cwd())
        : readBaseline(process.cwd());
      if (opts.json) return emit(baseline, true);
      if (!baseline) return console.log(`\n  ${out.dim("no baseline captured")}\n`);
      console.log(`\n  revision: ${baseline.revision || "(none)"}`);
      console.log(`  dirty paths (protected): ${baseline.dirtyPaths.length}`);
      console.log(`  pre-existing failures: ${baseline.failing.length}\n`);
    });

  const context = program.command("context").description("Deterministic context packs for agents");

  context
    .command("task")
    .description("Minimal context pack for one task")
    .argument("<taskId>", "Task id (e.g. TASK-001)")
    .action((taskId: string) => {
      try {
        const pack = contextForTask(process.cwd(), taskId);
        console.log(`\n${pack.markdown}\n`);
      } catch (err) {
        fail(err as Error);
      }
    });

  context
    .command("feature")
    .description("Context pack for a whole feature")
    .argument("<id>", "Feature id")
    .action((id: string) => {
      try {
        const pack = contextForFeature(process.cwd(), id);
        console.log(`\n${pack.markdown}\n`);
      } catch (err) {
        fail(err as Error);
      }
    });

  // ─── review / debug ───────────────────────────────────────────────────

  const review = program.command("review").description("Review findings (BLOCKER/WARNING/NOTE)");

  review
    .command("add")
    .description("Record review findings for a feature")
    .argument("<feature>", "Feature id")
    .requiredOption("--severity <s>", "BLOCKER|WARNING|NOTE")
    .requiredOption("--issue <text>", "What is wrong")
    .option("--file <path>", "File the finding refers to")
    .option("--requirement <id>", "Related requirement ID")
    .option("--scope <text>", "Review scope summary", "")
    .action((featureId: string, opts: { severity: string; issue: string; file?: string; requirement?: string; scope: string }) => {
      try {
        addFindings(process.cwd(), featureId, {
          scope: opts.scope,
          findings: [
            {
              severity: opts.severity as "BLOCKER" | "WARNING" | "NOTE",
              issue: opts.issue,
              file: opts.file ?? "",
              requirement: opts.requirement,
            },
          ],
        });
        console.log(`\n  ${out.green("✔")} finding recorded (${opts.severity})\n`);
      } catch (err) {
        fail(err as Error);
      }
    });

  review
    .command("verdict")
    .description("Record a review verdict as evidence (security review, browser QA)")
    .argument("<feature>", "Feature id")
    .requiredOption("--kind <k>", "security|qa")
    .requiredOption("--verdict <v>", "pass|fail")
    .requiredOption("--summary <text>", "What was reviewed and the outcome")
    .action((featureId: string, opts: { kind: string; verdict: string; summary: string }) => {
      try {
        recordReviewVerdict(
          process.cwd(),
          featureId,
          opts.kind === "qa" ? "review.qa" : "review.security",
          opts.verdict as "pass" | "fail",
          opts.summary
        );
        console.log(`\n  ${out.green("✔")} ${opts.kind} verdict recorded: ${opts.verdict}\n`);
      } catch (err) {
        fail(err as Error);
      }
    });

  const debug = program.command("debug").description("Systematic debugging sessions");

  debug
    .command("new")
    .description("Open a debug session (starts at REPRODUCE)")
    .requiredOption("--symptom <text>", "What is broken")
    .option("--feature <id>", "Related feature id")
    .action((opts: { symptom: string; feature?: string }) => {
      try {
        const s = createDebugSession(process.cwd(), { symptom: opts.symptom, featureId: opts.feature });
        console.log(`\n  ${out.green("✔")} ${s.id} opened at stage REPRODUCE`);
        console.log(`  Stages: ${DEBUG_STAGES.join(" → ")}\n`);
      } catch (err) {
        fail(err as Error);
      }
    });

  debug
    .command("advance")
    .description("Advance a debug session one stage (artifact required)")
    .argument("<id>", "Debug session id")
    .requiredOption("--to <stage>", `Next stage: ${DEBUG_STAGES.join("|")}`)
    .option("--reproduction <text>", "Reproduction steps")
    .option("--hypotheses <items>", "Comma-separated hypotheses")
    .option("--evidence <items>", "Comma-separated evidence notes")
    .option("--root-cause <text>", "Root cause statement")
    .option("--regression-test <text>", "Regression test reference")
    .option("--resolution <text>", "Fix description")
    .action((id: string, opts: { to: string; reproduction?: string; hypotheses?: string; evidence?: string; rootCause?: string; regressionTest?: string; resolution?: string }) => {
      try {
        const list = (v?: string) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
        advanceDebugStage(process.cwd(), id, opts.to as never, {
          reproduction: opts.reproduction,
          hypotheses: list(opts.hypotheses),
          evidenceNotes: list(opts.evidence),
          rootCause: opts.rootCause,
          regressionTest: opts.regressionTest,
          resolution: opts.resolution,
        });
        console.log(`\n  ${out.green("✔")} ${id} advanced to ${opts.to}\n`);
      } catch (err) {
        fail(err as Error);
      }
    });

  void resolveFinding;
  void setTaskStatus;

  // ─── Phase 3: repository intelligence / guardian / review / debug ctx ──

  const intel = program.command("intel").description("Repository intelligence: index, dependencies, impact, retrieval");

  intel
    .command("index")
    .description("Build or refresh the repository file index (.steward/intel/index.json)")
    .option("--json", "Machine-readable output", false)
    .action((opts: { json: boolean }) => {
      const index = buildIndex(process.cwd());
      if (opts.json) return emit({ files: index.files.length, revision: index.revision, indexedAt: index.indexedAt }, true);
      console.log(`\n  ${out.green("✔")} indexed ${index.files.length} files (revision ${index.revision.slice(0, 8) || "none"})\n`);
    });

  intel
    .command("deps")
    .description("Show what a file imports and what imports it")
    .argument("<file>", "Project file path")
    .option("--json", "Machine-readable output", false)
    .action((file: string, opts: { json: boolean }) => {
      const root = process.cwd();
      const index = ensureIndex(root);
      const map = buildDependencyMap(index);
      const rel = toProjectRelative(root, file);
      const data = {
        file: rel,
        imports: dependenciesOf(map, rel),
        importedBy: dependentsOf(map, rel),
        impactedTests: associatedTests(index, map, rel),
      };
      if (opts.json) return emit(data, true);
      console.log(`\n  ${out.bold(rel)}`);
      console.log(`  imports:      ${data.imports.join(", ") || out.dim("(none)")}`);
      console.log(`  imported by:  ${data.importedBy.join(", ") || out.dim("(none)")}`);
      console.log(`  tests:        ${data.impactedTests.join(", ") || out.dim("(none)")}\n`);
    });

  intel
    .command("impact")
    .description("Change-impact analysis for the working tree or explicit files")
    .argument("[files...]", "Changed files (defaults to git working-tree changes)")
    .option("--json", "Machine-readable output", false)
    .action((files: string[], opts: { json: boolean }) => {
      const impact = impactOfChangedFiles(process.cwd(), files.length > 0 ? files : workingTreeChanges(process.cwd()));
      if (opts.json) return emit(impact, true);
      console.log(`\n  changed: ${impact.changedFiles.length}, affected: ${impact.affected.length}, tests to run: ${impact.impactedTests.length}`);
      for (const t of impact.impactedTests) console.log(`  ${out.yellow("◆")} ${t}`);
      for (const n of impact.notes) console.log(`  ${out.dim("note:")} ${n}`);
      console.log("");
    });

  intel
    .command("retrieve")
    .description("Deterministic targeted context retrieval for a query")
    .argument("<query>", "Search text or TASK-NNN")
    .action((query: string) => {
      const result = retrieveContext(process.cwd(), query);
      console.log(`\n${result.markdown}\n`);
    });

  program
    .command("guardian")
    .description("Requirement-level implementation analysis (detects partial work even when tests pass)")
    .argument("[feature]", "Feature id (defaults to all active features)")
    .option("--json", "Machine-readable output", false)
    .action((featureId: string | undefined, opts: { json: boolean }) => {
      const root = process.cwd();
      const reports = featureId ? [guardFeature(root, featureId)] : guardAll(root);
      if (opts.json) return emit(reports, true);
      for (const report of reports) {
        const icon = report.verdict === "SATISFIED" ? out.green("✔") : out.red("✖");
        console.log(`\n  ${icon} ${out.bold(report.featureId)}: ${report.verdict}`);
        for (const r of report.requirements) {
          const mark = r.verdict === "IMPLEMENTED" ? out.green("IMPLEMENTED") : r.verdict === "PARTIAL" ? out.yellow("PARTIAL") : out.red("MISSING");
          console.log(`    ${r.requirementId.padEnd(18)} ${mark.padEnd(12)} ${r.title}`);
          for (const gap of r.gaps) console.log(`      ${out.yellow("↳")} ${gap}`);
        }
        for (const s of report.stubMarkers) {
          console.log(`    ${out.red("stub")} ${s.file}:${s.line} (${s.marker})`);
        }
      }
      console.log("");
    });

  review
    .command("diff")
    .description("Repository-aware diff review: scope drift, missing tests, TODOs, unsafe shortcuts, duplication")
    .argument("<feature>", "Feature id")
    .option("--files <paths>", "Comma-separated changed files (defaults to git working tree)")
    .option("--no-record", "Do not persist findings to review.yaml")
    .option("--json", "Machine-readable output", false)
    .action((featureId: string, opts: { files?: string; record: boolean; json: boolean }) => {
      const changed = opts.files?.split(",").map((s) => s.trim()).filter(Boolean);
      const result = reviewDiff(process.cwd(), featureId, { changed, record: opts.record });
      if (opts.json) return emit(result, true);
      console.log(`\n  diff review — ${result.changedFiles.length} changed file(s)`);
      for (const f of result.findings) {
        const sev = f.severity === "BLOCKER" ? out.red("BLOCKER") : f.severity === "WARNING" ? out.yellow("WARNING") : out.dim("NOTE");
        console.log(`  ${sev.padEnd(10)} ${f.file || "—"}  ${f.issue.slice(0, 90)}`);
      }
      console.log(`\n  ${result.summary.blockers} blocker(s), ${result.summary.warnings} warning(s), ${result.summary.notes} note(s)\n`);
      if (result.summary.blockers > 0) process.exitCode = 1;
    });

  debug
    .command("context")
    .description("Repository-aware debug context: suspect files, impacted tests")
    .argument("<id>", "Debug session id")
    .option("--json", "Machine-readable output", false)
    .action((id: string, opts: { json: boolean }) => {
      const ctx = debugContext(process.cwd(), id);
      if (opts.json) return emit(ctx, true);
      console.log(`\n${ctx.markdown}\n`);
    });

  program
    .command("freshness")
    .description("Check whether verification/QA evidence is still fresh against the current code")
    .argument("<feature>", "Feature id")
    .option("--json", "Machine-readable output", false)
    .action((featureId: string, opts: { json: boolean }) => {
      const kinds = ["verification.run", "review.qa", "review.security"] as const;
      const checks = kinds.map((kind) => checkFreshness(process.cwd(), featureId, kind));
      if (opts.json) return emit(checks, true);
      console.log("");
      for (const c of checks) {
        const mark = c.freshness === "FRESH" ? out.green("FRESH") : c.freshness === "STALE" ? out.red("STALE") : out.dim(c.freshness);
        console.log(`  ${mark.padEnd(14)} ${c.evidenceKind.padEnd(20)} ${c.detail}`);
      }
      console.log("");
    });
}

import { approveSpec } from "@steward/core";
import { readinessOf } from "@steward/core";

function approveSpecFlow(featureId: string, json: boolean): void {
  const { spec, approved } = approveSpec(process.cwd(), featureId);
  if (json) return emit({ spec, approved: true }, true);
  console.log(`\n  ${out.green("✔")} spec accepted for ${featureId}${approved ? "" : out.dim(" (already approved)")}`);
  console.log(`  Next: steward task add ${featureId} --objective "…" --req REQ-…-001\n`);
}

function readiness(root: string, featureId: string, taskId: string): TaskState | "READY" {
  const tasks = listTasks(root, featureId);
  const t = tasks.find((x) => x.id === taskId)!;
  return readinessOf(t, tasks) as TaskState | "READY";
}
