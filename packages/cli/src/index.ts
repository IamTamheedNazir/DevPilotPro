#!/usr/bin/env bun
import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  MANAGED_BY,
  VERSION,
  initBrain,
  parseSkill,
  brainPaths,
  runDoctor,
  skillsForProfile,
  type InstallProfile,
} from "@steward/core";
import {
  ADAPTERS,
  detectAll,
  planProjectInstall,
  runInstall,
  runUninstall,
  statusOf,
} from "@steward/adapters";
import { out, printChecks } from "./format.js";

const program = new Command();

program
  .name("steward")
  .description(
    "Steward — the engineering operating system for AI coding agents. Evidence over claims."
  )
  .version(VERSION);

// ─── init ────────────────────────────────────────────────────────────────

program
  .command("init")
  .description("Create the .vibe/ project brain (project truth, evidence ledger)")
  .option("-n, --name <name>", "Project name (defaults to directory name)")
  .option("-d, --description <desc>", "One-line project description")
  .option("-p, --profile <profile>", "Installation profile: minimal|builder|full|team", "builder")
  .option("-a, --autonomy <mode>", "guided|balanced|autonomous|audit", "balanced")
  .action((opts: { name?: string; description?: string; profile: string; autonomy: string }) => {
    const root = process.cwd();
    const name = opts.name ?? path.basename(path.resolve(root));
    try {
      const { created } = initBrain(root, {
        name,
        description: opts.description,
        profile: opts.profile as InstallProfile,
        autonomy: opts.autonomy as never,
      });
      console.log(`\n  ${out.green("✔")} Project brain created for ${out.bold(name)}\n`);
      for (const f of created) console.log(`      ${out.dim(f)}`);
      console.log(
        `\n  Next: review .vibe/project.yaml, then run ${out.cyan("steward install")}\n`
      );
    } catch (err) {
      console.error(`\n  ${out.red("✖")} ${(err as Error).message}\n`);
      process.exitCode = 1;
    }
  });

// ─── install ─────────────────────────────────────────────────────────────

program
  .command("install")
  .description("Install skills + harness artifacts for the selected coding agents")
  .option("-t, --target <targets...>", `Targets: ${ADAPTERS.map((a) => a.id).join("|")} (or 'all')`, "all")
  .option("-p, --profile <profile>", "Override the brain's installation profile")
  .option("--dry-run", "Show the plan without writing anything", false)
  .action((opts: { target: string[]; profile?: string; dryRun: boolean }) => {
    const root = process.cwd();
    try {
      const targets = opts.target.length === 1 && opts.target[0] === "all" ? "all" : opts.target;
      const outcome = runInstall(root, {
        targets: targets as never,
        profile: opts.profile as InstallProfile | undefined,
        dryRun: opts.dryRun,
      });
      const label = opts.dryRun ? "DRY RUN — no files written" : "install complete";
      console.log(`\n  ${out.bold(`Steward install (${label})`)}`);
      console.log(
        `  profile: ${outcome.profile}   targets: ${outcome.targets.join(", ")}   skills: ${outcome.skills.length}\n`
      );
      for (const action of outcome.plan) {
        const icon =
          action.kind === "skip"
            ? action.risk === "requires-confirmation"
              ? out.yellow("▲")
              : out.dim("·")
            : out.green(opts.dryRun ? "+" : "✔");
        console.log(`  ${icon} ${action.kind.padEnd(14)} ${action.file}${action.kind === "skip" ? out.dim(`  (${action.reason})`) : ""}`);
      }
      if (!opts.dryRun) {
        if (outcome.pruned && outcome.pruned.length > 0) {
          console.log(`\n  pruned stale files: ${outcome.pruned.join(", ")}`);
        }
        if (outcome.backupDir) {
          console.log(out.dim(`  previous versions backed up under .vibe/install/backups/`));
        }
        console.log(
          `\n  ${out.bold("Blocked")}: ${outcome.result?.blocked.length ?? outcome.blocked} action(s) need confirmation (foreign files are never overwritten implicitly).`
        );
        console.log(
          `  Open your coding agent and run ${out.cyan("/vibe")} to start.\n`
        );
      } else {
        console.log("");
      }
    } catch (err) {
      console.error(`\n  ${out.red("✖")} ${(err as Error).message}\n`);
      process.exitCode = 1;
    }
  });

// ─── doctor ──────────────────────────────────────────────────────────────

program
  .command("doctor")
  .description("Evidence-based project health report")
  .action(() => {
    const root = process.cwd();
    const detections = detectAll(root);
    const checks = runDoctor(root, detections);
    console.log(`\n  ${out.bold("Steward doctor")} — ${MANAGED_BY}\n`);
    printChecks(checks);
    const failed = checks.filter((c) => c.status === "fail").length;
    const warned = checks.filter((c) => c.status === "warn").length;
    console.log(
      `\n  ${failed > 0 ? out.red(`${failed} failing`) : out.green("no failures")}, ${warned} warning(s)\n`
    );
    if (failed > 0) process.exitCode = 1;
  });

// ─── status ──────────────────────────────────────────────────────────────

program
  .command("status")
  .description("Show brain, install, and drift status")
  .action(() => {
    const root = process.cwd();
    const s = statusOf(root);
    console.log(`\n  ${out.bold("Steward status")}`);
    if (s.brain) {
      console.log(`  brain:     ${s.brain.name} (profile=${s.brain.profile}, autonomy=${s.brain.autonomy})`);
    } else {
      console.log(`  brain:     ${out.yellow("not initialized")} — run: steward init`);
    }
    console.log(
      `  install:   ${s.manifest ? `v${s.manifest.version}, ${s.manifest.files} files` : "not installed"}`
    );
    const per = Object.entries(s.perTarget)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    console.log(`  artifacts: ${per || "none"}`);
    if (s.drift.missing.length > 0 || s.drift.modified.length > 0) {
      console.log(
        `  drift:     ${out.yellow(`${s.drift.missing.length} missing, ${s.drift.modified.length} modified`)} — run: steward repair`
      );
    } else if (s.manifest) {
      console.log(`  drift:     ${out.green("none")}`);
    }
    console.log("");
  });

// ─── adapters ────────────────────────────────────────────────────────────

program
  .command("adapters")
  .description("List supported coding agents, capabilities, and detection state")
  .action(() => {
    const root = process.cwd();
    console.log(`\n  ${out.bold("Supported harnesses")}\n`);
    for (const d of detectAll(root)) {
      const adapter = ADAPTERS.find((a) => a.id === d.id)!;
      const caps = adapter.capabilities;
      console.log(
        `  ${d.detected ? out.green("✔") : out.dim("·")} ${adapter.label.padEnd(18)} id=${adapter.id.padEnd(9)} confidence=${caps.confidence.padEnd(10)} ${out.dim(d.signals.join(", ") || "not detected")}`
      );
      console.log(
        out.dim(
          `      commands=${caps.projectCommands} nativeSkills=${String(caps.nativeSkills)} memoryDoc=${caps.memoryDoc ?? "—"} hooks=${String(caps.hooks)} mcp=${String(caps.mcp)}`
        )
      );
    }
    console.log(
      `\n  Confidence is evidence-backed; see docs/SUPPORT_MATRIX.md for sources.\n`
    );
  });

// ─── skills ──────────────────────────────────────────────────────────────

program
  .command("skills")
  .description("List canonical skills available for the given profile")
  .option("-p, --profile <profile>", "minimal|builder|full|team", "builder")
  .action((opts: { profile: string }) => {
    console.log(`\n  ${out.bold(`Canonical skills (${opts.profile})`)}\n`);
    for (const s of skillsForProfile(opts.profile as InstallProfile)) {
      console.log(
        `  ${s.front.id.padEnd(12)} risk=${s.front.risk.padEnd(8)} ${s.front.description}`
      );
    }
    console.log("");
  });

// ─── validate ────────────────────────────────────────────────────────────

program
  .command("validate")
  .description("Validate skill files against the canonical schema")
  .argument("<files...>", "Skill files to validate")
  .action((files: string[]) => {
    let bad = 0;
    for (const file of files) {
      try {
        const raw = fs.readFileSync(file, "utf8");
        const skill = parseSkill(raw, path.basename(file));
        console.log(
          `  ${out.green("✔")} ${file}  ${out.dim(`${skill.front.id} v${skill.front.version} risk=${skill.front.risk}`)}`
        );
      } catch (err) {
        bad++;
        console.error(`  ${out.red("✖")} ${file}\n      ${(err as Error).message}`);
      }
    }
    if (bad > 0) process.exitCode = 1;
  });

// ─── update / repair / uninstall ─────────────────────────────────────────

program
  .command("update")
  .description("Regenerate managed artifacts after upgrading Steward or changing profile")
  .option("--dry-run", "Show the plan without writing anything", false)
  .action((opts: { dryRun: boolean }) => {
    runInstallLike("update", { dryRun: opts.dryRun });
  });

program
  .command("repair")
  .description("Restore missing or drifted managed files (idempotent)")
  .option("--dry-run", "Show the plan without writing anything", false)
  .action((opts: { dryRun: boolean }) => {
    runInstallLike("repair", { dryRun: opts.dryRun });
  });

function runInstallLike(label: string, opts: { dryRun: boolean }): void {
  const root = process.cwd();
  try {
    const outcome = runInstall(root, { ...opts, updateManaged: true });
    const applied = outcome.result?.applied.length ?? 0;
    const blocked = outcome.result?.blocked.length ?? outcome.blocked;
    console.log(
      `\n  ${out.green("✔")} ${label}: ${opts.dryRun ? `${outcome.plan.length} planned action(s)` : `${applied} applied, ${outcome.result?.skipped.length ?? 0} already current, ${blocked} blocked`}\n`
    );
  } catch (err) {
    console.error(`\n  ${out.red("✖")} ${(err as Error).message}\n`);
    process.exitCode = 1;
  }
}

program
  .command("uninstall")
  .description("Remove Steward artifacts (project brain and user-modified files are preserved)")
  .option("--dry-run", "Show what would be removed without deleting", false)
  .action((opts: { dryRun: boolean }) => {
    const root = process.cwd();
    try {
      const result = runUninstall(root, { dryRun: opts.dryRun });
      console.log(`\n  ${out.bold(`uninstall ${opts.dryRun ? "(dry run)" : "complete"}`)}`);
      for (const f of result.removed) console.log(`  ${out.green("✔")} removed  ${f}`);
      for (const f of result.stripped) console.log(`  ${out.green("✔")} stripped ${f}`);
      for (const k of result.kept)
        console.log(`  ${out.yellow("▲")} kept     ${k.file} — ${k.reason}`);
      console.log(
        out.dim("\n  The .vibe/ project brain was preserved; delete it manually if you want to erase project truth.\n")
      );
    } catch (err) {
      console.error(`\n  ${out.red("✖")} ${(err as Error).message}\n`);
      process.exitCode = 1;
    }
  });

// ─── brain path helper (used by external tooling / agents) ───────────────

program
  .command("brain-path")
  .description("Print the absolute path of the project brain root")
  .action(() => {
    console.log(brainPaths(process.cwd()).root);
  });

program.parse();
