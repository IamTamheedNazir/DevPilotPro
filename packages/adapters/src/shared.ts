import { MANAGED_BY, VERSION, type CanonicalSkill } from "@steward/core";

/**
 * Context economy: every generated artifact is a thin pointer to the canonical
 * skill library at `.vibe/skills/<id>.md`. Bodies are loaded on demand, so a
 * project with 30 skills still pays ~1 line per skill of standing context.
 */
export const CANONICAL_DIR = ".vibe/skills";

export function canonicalPath(skill: CanonicalSkill): string {
  return `${CANONICAL_DIR}/${skill.front.id}.md`;
}

function header(comment: string): string {
  return `<!-- ${MANAGED_BY}. Do not edit; run 'steward update'. -->`;
}

const WORKFLOW_LINE =
  "Lifecycle state is deterministic: inspect it with `steward status` / `steward feature show <id>`, work tasks via `steward task start|verify|done`, and prove completion with `steward verify <feature>` — never claim COMPLETE without it. Your prose cannot change lifecycle state; only executed, recorded evidence can.";

/** Slash-command stub (Claude Code, OpenCode). */
export function commandStub(skill: CanonicalSkill): { front: string; body: string } {
  const front = ["---", `description: ${yamlScalar(skill.front.description)}`, "---", ""].join("\n");
  const body = [
    header(""),
    `Read and follow the Steward skill \`${canonicalPath(skill)}\` (v${skill.front.version}, "${skill.front.title}").`,
    "",
    "Apply its process and gates exactly. Do not claim any completion without the evidence that skill requires.",
    WORKFLOW_LINE,
    "",
    "Skill arguments: $ARGUMENTS",
    "",
  ].join("\n");
  return { front, body };
}

/** Generic rules-file body (Windsurf, Cline, Roo Code, ...). */
export function rulePointerBody(skill: CanonicalSkill): string {
  return [
    header(""),
    `Read and follow the Steward skill \`${canonicalPath(skill)}\` (v${skill.front.version}, "${skill.front.title}") before doing this work.`,
    "Apply its process and gates exactly; completion claims require the evidence that skill demands.",
    WORKFLOW_LINE,
    "",
  ].join("\n");
}

/** Cursor agent-requested rule (.mdc). */
export function cursorRuleBody(skill: CanonicalSkill): string {
  return [
    "---",
    `description: ${yamlScalar(`Steward skill '${skill.front.id}' — ${skill.front.description}`)}`,
    "alwaysApply: false",
    "---",
    "",
    header(""),
    `Read and follow the Steward skill \`${canonicalPath(skill)}\` (v${skill.front.version}, "${skill.front.title}") before doing this work.`,
    "Apply its process and gates exactly; completion claims require the evidence that skill demands.",
    WORKFLOW_LINE,
    "",
  ].join("\n");
}

/** Gemini CLI custom command (.toml). */
export function geminiToml(skill: CanonicalSkill): string {
  const description = tomlString(`Steward: ${skill.front.title}`);
  const prompt = tomlMultiline(
    [
      `Read and follow the Steward skill \`${canonicalPath(skill)}\` (v${skill.front.version}, "${skill.front.title}").`,
      "Apply its process and gates exactly. Do not claim any completion without the evidence that skill requires.",
      WORKFLOW_LINE,
    ].join("\n")
  );
  return `description = ${description}\nprompt = ${prompt}\n`;
}

/** Claude Code native skill (progressive disclosure: description standing, body on demand). */
export function claudeSkillMd(skill: CanonicalSkill): string {
  return [
    "---",
    `name: ${skill.front.id}`,
    `description: ${yamlScalar(skill.front.description)}`,
    "---",
    "",
    header(""),
    `Read and follow the Steward skill \`${canonicalPath(skill)}\` (v${skill.front.version}, "${skill.front.title}").`,
    "Apply its process and gates exactly; completion claims require the evidence that skill demands.",
    WORKFLOW_LINE,
    "",
  ].join("\n");
}

/** Index block for always-read memory docs (AGENTS.md, GEMINI.md). */
export function memoryIndexMarkdown(skills: CanonicalSkill[], harnessLabel: string): string {
  const rows = skills.map(
    (s) => `| ${s.front.id} | ${s.front.risk} | ${s.front.description} |`
  );
  return [
    `## Steward engineering skills (v${VERSION})`,
    "",
    `This project uses Steward. Before starting matching work in ${harnessLabel}, read the relevant skill file from \`${CANONICAL_DIR}/\` and follow it exactly.`,
    "",
    "| Skill | Risk | Use for |",
    "|---|---|---|",
    ...rows,
    "",
    "Completion claims require evidence (test output, command results, browser verification). The `/vibe` skill is the entry point when unsure.",
    WORKFLOW_LINE,
    "",
  ].join("\n");
}

// ─── serialization helpers ───────────────────────────────────────────────

export function yamlScalar(value: string): string {
  const safe = value.replace(/"/g, '\\"').replace(/\r?\n/g, " ");
  return `"${safe}"`;
}

export function tomlString(value: string): string {
  const safe = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ");
  return `"${safe}"`;
}

export function tomlMultiline(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n");
  if (normalized.includes("'''")) {
    throw new Error("content contains ''' and cannot be embedded in a TOML literal string");
  }
  return `'''\n${normalized}\n'''`;
}
