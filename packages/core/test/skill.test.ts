import { describe, expect, it } from "vitest";
import { parseSkill, SkillError, SKILL_SCHEMA_ID } from "../src/schema/skill.js";

const VALID = `---
schema: steward.skill.v1
id: demo
title: Demo Skill
version: 1.2.3
description: A demo skill used by the schema tests only.
type: skill
risk: low
triggers:
  intents: [demo]
outputs: [demo-output]
profiles: [builder, full]
---

# Demo Skill

Body content that is long enough to satisfy the minimum body length check
for a canonical skill document (at least twenty characters).
`;

describe("parseSkill", () => {
  it("parses a valid skill and applies defaults", () => {
    const skill = parseSkill(VALID, "skills/demo.md");
    expect(skill.front.schema).toBe(SKILL_SCHEMA_ID);
    expect(skill.front.id).toBe("demo");
    expect(skill.front.version).toBe("1.2.3");
    expect(skill.front.type).toBe("skill");
    expect(skill.front.risk).toBe("low");
    expect(skill.front.profiles).toEqual(["builder", "full"]);
    expect(skill.body).toContain("# Demo Skill");
  });

  it("rejects a missing frontmatter block", () => {
    expect(() => parseSkill("no frontmatter here", "x.md")).toThrow(SkillError);
  });

  it("rejects a wrong schema id", () => {
    const bad = VALID.replace("steward.skill.v1", "steward.skill.v2");
    expect(() => parseSkill(bad, "x.md")).toThrow(/schema/);
  });

  it("rejects an invalid kebab-case id", () => {
    const bad = VALID.replace("id: demo", "id: Demo_Skill");
    expect(() => parseSkill(bad, "x.md")).toThrow(SkillError);
  });

  it("rejects a non-semver version", () => {
    const bad = VALID.replace("version: 1.2.3", "version: 1.0");
    expect(() => parseSkill(bad, "x.md")).toThrow(/version/);
  });

  it("rejects a too-short description", () => {
    const bad = VALID.replace(
      "description: A demo skill used by the schema tests only.",
      "description: Short."
    );
    expect(() => parseSkill(bad, "x.md")).toThrow(SkillError);
  });

  it("rejects an unknown profile", () => {
    const bad = VALID.replace("profiles: [builder, full]", "profiles: [mega]");
    expect(() => parseSkill(bad, "x.md")).toThrow(SkillError);
  });

  it("rejects an empty body", () => {
    const bad = `${VALID.split("\n---\n")[0]}\n---\n\n   \n`;
    expect(() => parseSkill(bad, "x.md")).toThrow(/body/);
  });

  it("rejects unknown frontmatter keys (strict schema)", () => {
    const bad = VALID.replace("risk: low", "risk: low\n  custom: true");
    expect(() => parseSkill(bad, "x.md")).toThrow(SkillError);
  });
});
