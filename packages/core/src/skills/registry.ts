import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseSkill,
  type CanonicalSkill,
  type InstallProfile,
} from "../schema/skill.js";

/**
 * Locate the repository's canonical `skills/` directory by walking upward
 * from this module until a directory containing `skills/vibe.md` is found.
 * Works from source checkouts and from installed package layouts alike.
 */
export function builtinSkillsDir(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, "skills");
    if (fs.existsSync(path.join(candidate, "vibe.md"))) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    "cannot locate canonical skills directory (expected skills/vibe.md above the package)"
  );
}

export function listBuiltinSkills(): CanonicalSkill[] {
  const dir = builtinSkillsDir();
  const skills: CanonicalSkill[] = [];
  for (const entry of fs.readdirSync(dir).sort()) {
    if (!entry.endsWith(".md")) continue;
    const file = path.join(dir, entry);
    const raw = fs.readFileSync(file, "utf8");
    skills.push(parseSkill(raw, `skills/${entry}`));
  }
  return skills;
}

export function skillsForProfile(
  profile: InstallProfile
): CanonicalSkill[] {
  return listBuiltinSkills().filter((s) => s.front.profiles.includes(profile));
}
