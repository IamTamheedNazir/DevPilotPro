import * as fs from "node:fs";
import { VERSION } from "../version.js";
import { Ledger } from "../schema/ledger.js";
import { brainExists, readProjectBrain } from "../brain/init.js";
import { brainPaths } from "../brain/paths.js";
import { readManifest } from "../install/engine.js";
import { sha256 } from "../util/hash.js";
import { pathExists, readIfExists, resolveWithin } from "../util/fs.js";
import { parseSkill } from "../schema/skill.js";

export type CheckStatus = "pass" | "warn" | "fail" | "unknown";

export interface CheckResult {
  id: string;
  status: CheckStatus;
  detail: string;
  hint?: string;
}

export interface DoctorDetection {
  id: string;
  detected: boolean;
  signals: string[];
}

function nodeMajor(): number {
  return Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
}

/**
 * Evidence-based project health report. Every check states its evidence;
 * no invented scores. `detections` come from the adapter layer.
 */
export function runDoctor(root: string, detections: DoctorDetection[]): CheckResult[] {
  const checks: CheckResult[] = [];
  const p = brainPaths(root);

  // runtime
  const major = nodeMajor();
  checks.push(
    major >= 20
      ? { id: "runtime.node", status: "pass", detail: `node ${process.versions.node}` }
      : {
          id: "runtime.node",
          status: major >= 18 ? "warn" : "fail",
          detail: `node ${process.versions.node}; steward targets node >= 20`,
        }
  );

  // git
  checks.push(
    pathExists(root + "/.git")
      ? { id: "project.git", status: "pass", detail: "git repository present" }
      : {
          id: "project.git",
          status: "warn",
          detail: "no .git directory found",
          hint: "git history is the rollback backbone for recovery and evidence",
        }
  );

  // brain
  if (!brainExists(root)) {
    checks.push({
      id: "brain.present",
      status: "fail",
      detail: `no project brain at ${p.projectYaml}`,
      hint: "run: steward init",
    });
  } else {
    try {
      const brain = readProjectBrain(root);
      checks.push({
        id: "brain.present",
        status: "pass",
        detail: `brain valid (profile=${brain.profile}, autonomy=${brain.autonomy})`,
      });
    } catch (err) {
      checks.push({
        id: "brain.present",
        status: "fail",
        detail: (err as Error).message,
      });
    }

    // installed skills parse
    const skillsDir = p.skillsDir;
    if (pathExists(skillsDir)) {
      const broken: string[] = [];
      let count = 0;
      for (const f of fs.readdirSync(skillsDir)) {
        if (!f.endsWith(".md")) continue;
        count++;
        const raw = readIfExists(`${skillsDir}/${f}`);
        if (!raw) continue;
        try {
          parseSkill(raw, f);
        } catch (err) {
          broken.push(`${f}: ${(err as Error).message.split("\n")[0]}`);
        }
      }
      checks.push(
        broken.length === 0
          ? { id: "brain.skills", status: "pass", detail: `${count} installed skills parse` }
          : {
              id: "brain.skills",
              status: "fail",
              detail: `${broken.length} invalid skill file(s): ${broken.join("; ")}`,
              hint: "run: steward repair",
            }
      );
    } else {
      checks.push({
        id: "brain.skills",
        status: "warn",
        detail: "no .vibe/skills directory",
        hint: "run: steward install",
      });
    }
  }

  // ledger
  if (pathExists(p.ledgerJsonl)) {
    const ledger = new Ledger(p.ledgerJsonl);
    const verdict = ledger.verify();
    checks.push(
      verdict.ok
        ? { id: "ledger.integrity", status: "pass", detail: `${verdict.count} evidence records, chain intact` }
        : {
            id: "ledger.integrity",
            status: "fail",
            detail: `evidence ledger failed verification: ${verdict.error}`,
            hint: "the ledger is append-only; investigate manual edits before trusting history",
          }
    );
  } else {
    checks.push({
      id: "ledger.integrity",
      status: "warn",
      detail: "no evidence ledger yet",
      hint: "created by steward init",
    });
  }

  // install manifest + drift
  const manifest = readManifest(root);
  if (!manifest) {
    checks.push({
      id: "install.manifest",
      status: "warn",
      detail: "nothing installed (or manifest missing/corrupt)",
      hint: "run: steward install",
    });
  } else {
    const drifted: string[] = [];
    const missing: string[] = [];
    for (const entry of manifest.files) {
      const current = readIfExists(resolveWithin(root, entry.file));
      if (current === null) {
        missing.push(entry.file);
      } else if (sha256(current) !== entry.hash) {
        drifted.push(entry.file);
      }
    }
    checks.push({
      id: "install.manifest",
      status: "pass",
      detail: `${manifest.files.length} tracked files (steward v${manifest.version})`,
    });
    checks.push(
      missing.length === 0 && drifted.length === 0
        ? { id: "install.drift", status: "pass", detail: "all tracked files match manifest hashes" }
        : {
            id: "install.drift",
            status: missing.length > 0 ? "fail" : "warn",
            detail: `${missing.length} missing, ${drifted.length} modified: ${[...missing, ...drifted].slice(0, 5).join(", ")}${missing.length + drifted.length > 5 ? " …" : ""}`,
            hint: "run: steward repair",
          }
    );
  }

  // adapters (injected)
  const detected = detections.filter((d) => d.detected);
  checks.push({
    id: "adapters.detected",
    status: "pass",
    detail:
      detected.length > 0
        ? `detected: ${detected.map((d) => d.id).join(", ")}`
        : "no coding-agent configuration detected",
    hint: detected.length === 0 ? "run: steward install --target all" : undefined,
  });

  return checks;
}
