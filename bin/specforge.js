#!/usr/bin/env node

// SpecForge CLI - Bin Entry Point
// This file bootstraps the TypeScript CLI using tsx for development
// or the compiled dist/ for production

import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

// Try to load compiled version first
const compiledPath = join(rootDir, "dist", "cli", "index.js");
const devPath = join(rootDir, "src", "cli", "index.ts");

if (existsSync(compiledPath)) {
  await import(compiledPath);
} else if (existsSync(devPath)) {
  // Use tsx for development
  const { execSync } = await import("child_process");
  const tsxPath = join(rootDir, "node_modules", ".bin", "tsx");

  if (existsSync(tsxPath)) {
    execSync(`"${tsxPath}" "${devPath}"`, {
      stdio: "inherit",
      cwd: rootDir,
    });
  } else {
    console.error("Error: tsx not found. Run: npm install");
    process.exit(1);
  }
} else {
  console.error("Error: Could not find CLI entry point.");
  console.error("Run 'npm run build' first, or ensure src/cli/index.ts exists.");
  process.exit(1);
}
