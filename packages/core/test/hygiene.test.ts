import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

describe("repository hygiene", () => {
  it("does not track tsconfig.tsbuildinfo (regression guard)", () => {
    const tracked = execSync("git ls-files", { cwd: REPO_ROOT, encoding: "utf8" });
    expect(tracked.split("\n")).not.toContain("tsconfig.tsbuildinfo");
  });

  it("keeps tsconfig.tsbuildinfo ignored", () => {
    const ignore = readFileSync(path.join(REPO_ROOT, ".gitignore"), "utf8");
    expect(ignore).toMatch(/tsconfig\.tsbuildinfo/);
  });
});
