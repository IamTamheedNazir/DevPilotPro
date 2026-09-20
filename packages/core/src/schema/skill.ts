import { z } from "zod";
import { splitFrontmatter } from "../util/frontmatter.js";

export const SKILL_SCHEMA_ID = "steward.skill.v1";

export const INSTALL_PROFILES = ["minimal", "builder", "full", "team"] as const;
export type InstallProfile = (typeof INSTALL_PROFILES)[number];

export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const SkillFrontmatterV1 = z
  .object({
    schema: z.literal(SKILL_SCHEMA_ID),
    id: z
      .string()
      .regex(/^[a-z][a-z0-9-]{1,47}$/, "id must be kebab-case, 2-48 chars"),
    title: z.string().min(3).max(80),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, "version must be semver X.Y.Z"),
    description: z
      .string()
      .min(10)
      .max(240)
      .describe("One line: what this skill does and when to use it"),
    type: z.enum(["skill", "command"]).default("skill"),
    risk: z.enum(RISK_LEVELS).default("medium"),
    triggers: z
      .object({
        intents: z.array(z.string().min(2)).default([]),
      })
      .default({ intents: [] }),
    requires: z.array(z.string()).default([]),
    outputs: z.array(z.string()).default([]),
    profiles: z.array(z.enum(INSTALL_PROFILES)).default([
      "minimal",
      "builder",
      "full",
      "team",
    ]),
  })
  .strict();

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterV1>;

export interface CanonicalSkill {
  front: SkillFrontmatter;
  body: string;
  raw: string;
  sourcePath: string;
}

export class SkillError extends Error {
  readonly issues: string[];
  constructor(message: string, issues: string[] = []) {
    super(issues.length > 0 ? `${message}\n  - ${issues.join("\n  - ")}` : message);
    this.name = "SkillError";
    this.issues = issues;
  }
}

/** Parse and validate a canonical skill document (frontmatter + body). */
export function parseSkill(raw: string, sourcePath: string): CanonicalSkill {
  let doc;
  try {
    doc = splitFrontmatter(raw);
  } catch (err) {
    throw new SkillError(`${sourcePath}: ${(err as Error).message}`);
  }
  const result = SkillFrontmatterV1.safeParse(doc.data);
  if (!result.success) {
    throw new SkillError(
      `${sourcePath}: frontmatter does not satisfy ${SKILL_SCHEMA_ID}`,
      result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    );
  }
  const body = doc.body.trimStart();
  if (body.trim().length < 20) {
    throw new SkillError(`${sourcePath}: skill body is empty or too short`);
  }
  return { front: result.data, body, raw, sourcePath };
}
