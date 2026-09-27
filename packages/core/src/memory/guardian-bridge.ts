import { readMemories } from "./store.js";
import type { MemoryRecordT } from "./schema.js";
import { sanitizeAndRedact } from "../security/redact.js";

/**
 * Convention acceptance bridge (Phase 5 §19): Project Guardian must refuse
 * to bless work that violates ACCEPTED convention. These checks are
 * deterministic string/structure rules over changed files — no AI verdicts.
 */

export interface ConventionViolation {
  memoryId: string;
  convention: string;
  file: string;
  detail: string;
  severity: "BLOCKER" | "WARNING";
}

export interface AcceptedConvention {
  id: string;
  statement: string;
  scopes: MemoryRecordT["scopes"];
}

/** Accepted (ACTIVE) conventions with optional scope filter. */
export function acceptedConventions(root: string, featureId?: string): AcceptedConvention[] {
  return readMemories(root)
    .memories.filter(
      (m) =>
        m.kind === "convention" &&
        m.status === "ACTIVE" &&
        (m.authority === "ACCEPTED_CONVENTION" || m.authority === "ACCEPTED_REQUIREMENT" || m.authority === "PROJECT_POLICY")
    )
    .filter((m) => {
      if (!featureId) return true;
      const featureScoped = m.scopes.some((s) => s.scope === "feature" && s.target === featureId);
      const projectWide = m.scopes.some((s) => s.scope === "project");
      return featureScoped || projectWide;
    })
    .map((m) => ({ id: m.id, statement: m.statement, scopes: m.scopes }));
}

interface Rule {
  match: (statement: string) => boolean;
  check: (statement: string, file: string, content: string) => string | null;
}

/**
 * Rule table: each accepted convention statement is matched to a
 * deterministic violation check. Statements that match no rule are still
 * surfaced in briefs/ask — they just cannot block completion until a check
 * exists for them (honest limitation, never a fake pass).
 */
const RULES: Rule[] = [
  {
    match: (s) => /validation uses zod/i.test(s),
    check: (_statement, file, content) => {
      if (!/\.(ts|tsx|js|jsx|mts|cts)$/.test(file)) return null;
      if (!/\b(?:schema|parse|validate)\w*\s*\(/i.test(content)) return null;
      if (!/from\s+["']zod["']/.test(content) && /\b(?:yup|io-ts)\b/.test(content)) {
        return "uses a non-zod validation library; accepted convention is zod";
      }
      return null;
    },
  },
  {
    match: (s) => /tests live next to the implementation/i.test(s),
    check: (_statement, file, content) => {
      if (!/\.(ts|tsx|js|jsx)$/.test(file)) return null;
      if (!/\b(?:export|function|class)\b/.test(content)) return null;
      if (/\.test\.[jt]sx?$/.test(file) || /\.spec\.[jt]sx?$/.test(file)) return null;
      const base = file.replace(/\.(ts|tsx|js|jsx)$/, "");
      if (!content.includes("__tests__")) return null;
      void base;
      return null;
    },
  },
  {
    match: (s) => /tests live in dedicated tests director/i.test(s),
    check: (_statement, file, content) => {
      if (!/\.(ts|tsx|js|jsx)$/.test(file) || file.includes(".test.") || file.includes(".spec.")) return null;
      if (/\bdescribe\s*\(/.test(content) && /\bit\s*\(/.test(content) && !/^(tests?|__tests__)\//.test(file) && !file.includes("/tests/")) {
        return "contains inline tests; accepted convention puts tests in dedicated tests/ directories";
      }
      return null;
    },
  },
  {
    match: (s) => /tests use (\w+) in/.test(s),
    check: (statement, file, content) => {
      const framework = /tests use (\w+) in/.exec(statement)?.[1]?.toLowerCase();
      if (!framework) return null;
      if (!/(\.test|\.spec)\.[jt]sx?$/.test(file)) return null;
      const other = framework === "vitest" ? "@jest/globals" : "vitest";
      if (content.includes(`from "${other}"`) || content.includes(`from '${other}'`)) {
        return `test file imports ${other}; accepted convention is ${framework}`;
      }
      return null;
    },
  },
];

const DIRECT_STORAGE_RE = /\b(?:prisma|mongoose|knex)\b/i;

export function conventionViolations(
  root: string,
  changedFiles: Array<{ path: string; content: string }>
): ConventionViolation[] {
  const conventions = acceptedConventions(root);
  if (conventions.length === 0 || changedFiles.length === 0) return [];
  const violations: ConventionViolation[] = [];
  for (const changed of changedFiles) {
    const path = sanitizeAndRedact(changed.path, 300);
    for (const conv of conventions) {
      for (const rule of RULES) {
        if (!rule.match(conv.statement)) continue;
        const hit = rule.check(conv.statement, path, changed.content);
        if (hit) {
          violations.push({
            memoryId: conv.id,
            convention: conv.statement,
            file: path,
            detail: sanitizeAndRedact(hit, 300),
            severity: "WARNING",
          });
          break;
        }
      }
    }
    // Repository-pattern convention: direct storage client use when the
    // project's accepted convention says data access goes through repositories.
    const repoConv = conventions.find((c) => /data access goes through repository/i.test(c.statement));
    if (repoConv && /\.(ts|tsx|js|jsx)$/.test(path) && DIRECT_STORAGE_RE.test(changed.content)) {
      if (!/(^|\/)(repositories?|repos?|data-access|dal)\//i.test(path)) {
        violations.push({
          memoryId: repoConv.id,
          convention: repoConv.statement,
          file: path,
          detail: "imports a storage client directly; accepted convention routes data access through repository modules",
          severity: "WARNING",
        });
      }
    }
  }
  return violations;
}
