import * as fs from "node:fs";
import * as path from "node:path";
import { dump as dumpYaml, load as loadYaml } from "js-yaml";
import { MANAGED_BY, VERSION } from "../version.js";
import { Ledger } from "../schema/ledger.js";
import { ProjectBrainConfig, type ProjectBrain } from "../schema/project.js";
import { brainPaths } from "./paths.js";
import { pathExists, writeFileSafe } from "../util/fs.js";

export class BrainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrainError";
  }
}

const README = (title: string, purpose: string): string =>
  `# ${title}\n\n${purpose}\n\n<!-- ${MANAGED_BY} scaffold; replace this file's content with real project truth -->\n`;

export function brainExists(root: string): boolean {
  return pathExists(brainPaths(root).projectYaml);
}

export function readProjectBrain(root: string): ProjectBrain {
  const file = brainPaths(root).projectYaml;
  if (!pathExists(file)) {
    throw new BrainError(
      `no project brain at ${file}; run 'steward init' first`
    );
  }
  const data = loadYaml(fs.readFileSync(file, "utf8"));
  const parsed = ProjectBrainConfig.safeParse(data);
  if (!parsed.success) {
    throw new BrainError(
      `${file} is invalid: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
    );
  }
  return parsed.data;
}

export function writeProjectBrain(root: string, brain: ProjectBrain): void {
  writeFileSafe(brainPaths(root).projectYaml, dumpYaml(brain, { noRefs: true }));
}

export interface InitBrainOptions {
  name: string;
  description?: string;
  profile?: ProjectBrain["profile"];
  autonomy?: ProjectBrain["autonomy"];
  stack?: string[];
}

/**
 * Create the project brain. Never overwrites existing brain files except the
 * scaffold READMEs that have not been replaced by the user.
 */
export function initBrain(root: string, opts: InitBrainOptions): { created: string[] } {
  const p = brainPaths(root);
  if (brainExists(root)) {
    throw new BrainError(
      `project brain already exists at ${p.projectYaml}; refusing to overwrite project truth`
    );
  }

  const brain: ProjectBrain = ProjectBrainConfig.parse({
    name: opts.name,
    description: opts.description ?? "",
    profile: opts.profile ?? "builder",
    autonomy: opts.autonomy ?? "balanced",
    stack: opts.stack ?? [],
  });

  const created: string[] = [];
  const dirs = [
    p.decisionsDir,
    p.tasksDir,
    p.researchDir,
    p.memoryDir,
    p.evidenceDir,
    p.qaDir,
    p.securityDir,
    p.handoffsDir,
    p.sessionsDir,
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  writeProjectBrain(root, brain);
  created.push(path.relative(root, p.projectYaml));

  const scaffold: Array<[string, string]> = [
    [p.productMd, README("Product", "What this product is, who it is for, and the core jobs to be done.")],
    [p.requirementsMd, README("Requirements", "Accepted requirements with stable IDs (e.g. REQ-AUTH-001). Rejected ideas are recorded too.")],
    [p.architectureMd, README("Architecture", "System boundaries, data ownership, and the accepted architecture at a glance.")],
    [path.join(p.decisionsDir, "README.md"), README("Decisions", "Architecture Decision Records: context, options, decision, consequences.")],
    [path.join(p.tasksDir, "README.md"), README("Tasks", "Planned, in-progress, and blocked tasks with completion criteria.")],
    [path.join(p.researchDir, "README.md"), README("Research", "Verified findings with sources, timestamps, versions, and confidence labels.")],
    [p.learnedYaml, "# Learned instincts (CANDIDATE | ACCEPTED | REJECTED | EXPIRED)\n# See docs/PROJECT_BRAIN.md for the candidate schema.\nlearned: []\n"],
    [path.join(p.handoffsDir, "README.md"), README("Handoffs", "Cross-agent session handoffs: objective, state, evidence, next action.")],
    [path.join(p.sessionsDir, "README.md"), README("Sessions", "Per-session scratch notes. Promote anything durable into the governed files above.")],
  ];
  for (const [file, content] of scaffold) {
    writeFileSafe(file, content);
    created.push(path.relative(root, file));
  }

  const ledger = new Ledger(p.ledgerJsonl);
  ledger.append("brain.init", `steward-cli@${VERSION}`, "project", {
    profile: brain.profile,
    autonomy: brain.autonomy,
  });

  return { created };
}
