// DevPilot CLI - Configuration Manager
// Handles reading/writing CLI configuration

import * as fs from "fs";
import * as path from "path";
import { CLIConfig } from "./types.js";

const CONFIG_FILE = ".specforge.json";
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || ".";

function getConfigPath(): string {
  return path.join(HOME_DIR, CONFIG_FILE);
}

export function loadConfig(): CLIConfig {
  const configPath = getConfigPath();

  const defaults: CLIConfig = {
    defaultFramework: "react",
    defaultLanguage: "typescript",
    defaultAgents: ["claude-code"],
    outputDir: "./projects",
  };

  if (!fs.existsSync(configPath)) {
    return defaults;
  }

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const saved = JSON.parse(raw);
    return { ...defaults, ...saved };
  } catch {
    return defaults;
  }
}

export function saveConfig(config: CLIConfig): void {
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function updateConfig(updates: Partial<CLIConfig>): CLIConfig {
  const current = loadConfig();
  const updated = { ...current, ...updates };
  saveConfig(updated);
  return updated;
}
