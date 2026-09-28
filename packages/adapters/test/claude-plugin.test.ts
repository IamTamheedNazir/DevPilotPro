import { describe, expect, it } from "vitest";
import {
  generateClaudePlugin,
  marketplaceJson,
  pluginJson,
  MARKETPLACE_FILE,
  PLUGIN_DIR,
  PLUGIN_NAME,
} from "../src/claude-plugin.js";
import { listBuiltinSkills } from "@steward/core";

describe("claude plugin generation", () => {
  it("marketplace manifest has required fields and a valid relative source", () => {
    const manifest = JSON.parse(marketplaceJson());
    expect(manifest.name).toBe("steward");
    expect(manifest.owner.name).toBeTruthy();
    expect(Array.isArray(manifest.plugins)).toBe(true);
    expect(manifest.plugins).toHaveLength(1);

    const entry = manifest.plugins[0];
    expect(entry.name).toBe(PLUGIN_NAME);
    expect(entry.source).toBe(`./${PLUGIN_DIR}`);
    // Relative sources must not escape the marketplace root.
    expect(entry.source.startsWith("..")).toBe(false);
  });

  it("plugin manifest name matches the marketplace entry name", () => {
    const manifest = JSON.parse(marketplaceJson());
    const plugin = JSON.parse(pluginJson());
    // Claude Code requires entry name === manifest name for install-by-name.
    expect(plugin.name).toBe(manifest.plugins[0].name);
    expect(plugin.version).toBe(manifest.plugins[0].version);
  });

  it("generates a command and a native skill for every canonical skill", () => {
    const files = generateClaudePlugin();
    const skills = listBuiltinSkills();
    expect(skills.length).toBeGreaterThan(0);

    for (const skill of skills) {
      const cmd = files.find((f) => f.file === `${PLUGIN_DIR}/commands/${skill.front.id}.md`);
      const native = files.find((f) => f.file === `${PLUGIN_DIR}/skills/${skill.front.id}/SKILL.md`);
      expect(cmd, `command for ${skill.front.id}`).toBeDefined();
      expect(native, `native skill for ${skill.front.id}`).toBeDefined();
    }
    // Plus the two manifests.
    expect(files.length).toBe(skills.length * 2 + 2);
  });

  it("plugin artifacts are self-contained: skill bodies embedded, not pointers", () => {
    const files = generateClaudePlugin();
    const skillBody = listBuiltinSkills()[0].body;
    const native = files.find((f) => f.file!.endsWith("/SKILL.md"))!;
    // Plugin cache copies files, so .vibe/skills pointers would break.
    expect(native.content).not.toContain(".vibe/skills/");
    expect(native.content).toContain(skillBody.trim().split("\n")[0]);
  });

  it("frontmatter is valid YAML-safe (quoted descriptions, no bare colons)", () => {
    const files = generateClaudePlugin();
    for (const f of files) {
      if (!f.file.endsWith(".md")) continue;
      const frontmatter = f.content.split("---\n")[1];
      expect(frontmatter).toBeDefined();
      for (const line of frontmatter.split("\n")) {
        if (!line.trim()) continue;
        expect(line, `${f.file}: ${line}`).toMatch(/^[a-z-]+: /);
      }
    }
  });

  it("generation is deterministic (same input, byte-identical output)", () => {
    const a = generateClaudePlugin();
    const b = generateClaudePlugin();
    expect(a).toEqual(b);
    expect(a.map((f) => f.file)).toContain(MARKETPLACE_FILE);
  });
});
