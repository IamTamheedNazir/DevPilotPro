/**
 * Regenerate the committed Claude Code marketplace/plugin tree from the
 * canonical skill library.
 *
 * - `bun run plugin:sync`   write/refresh the plugin files
 * - `bun run plugin:check`  fail if the committed tree would change (used in CI)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { generateClaudePlugin } from "@steward/adapters";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

const check = process.argv.includes("--check");

const files = generateClaudePlugin();
let changed = 0;

for (const { file, content } of files) {
  const abs = path.join(repoRoot, file);
  const existing = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
  if (existing === content) continue;
  if (check) {
    console.error(`DRIFT: ${file} does not match generated output (run 'bun run plugin:sync')`);
    changed++;
  } else {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    console.log(`wrote ${file}`);
  }
}

if (check) {
  if (changed > 0) {
    console.error(`\n${changed} file(s) drifted from the canonical skills. Run 'bun run plugin:sync' and commit.`);
    process.exit(1);
  }
  console.log(`plugin tree up to date (${files.length} files)`);
}
