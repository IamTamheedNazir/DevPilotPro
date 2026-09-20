import * as path from "node:path";

export const BRAIN_DIR = ".vibe";

export const brainPaths = (root: string) => ({
  root: path.join(root, BRAIN_DIR),
  projectYaml: path.join(root, BRAIN_DIR, "project.yaml"),
  productMd: path.join(root, BRAIN_DIR, "product.md"),
  requirementsMd: path.join(root, BRAIN_DIR, "requirements.md"),
  architectureMd: path.join(root, BRAIN_DIR, "architecture.md"),
  decisionsDir: path.join(root, BRAIN_DIR, "decisions"),
  tasksDir: path.join(root, BRAIN_DIR, "tasks"),
  researchDir: path.join(root, BRAIN_DIR, "research"),
  memoryDir: path.join(root, BRAIN_DIR, "memory"),
  learnedYaml: path.join(root, BRAIN_DIR, "memory", "learned.yaml"),
  evidenceDir: path.join(root, BRAIN_DIR, "evidence"),
  ledgerJsonl: path.join(root, BRAIN_DIR, "evidence", "ledger.jsonl"),
  qaDir: path.join(root, BRAIN_DIR, "qa"),
  securityDir: path.join(root, BRAIN_DIR, "security"),
  handoffsDir: path.join(root, BRAIN_DIR, "handoffs"),
  sessionsDir: path.join(root, BRAIN_DIR, "sessions"),
  skillsDir: path.join(root, BRAIN_DIR, "skills"),
  installDir: path.join(root, BRAIN_DIR, "install"),
  manifestJson: path.join(root, BRAIN_DIR, "install", "manifest.json"),
});
