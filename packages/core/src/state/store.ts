import * as fs from "node:fs";
import { dump as dumpYaml, load as loadYaml } from "js-yaml";
import type { ZodTypeAny, z } from "zod";
import { ensureDir, pathExists } from "../util/fs.js";
import { StateError } from "./ids.js";

export function readYaml<S extends ZodTypeAny>(file: string, schema: S): z.infer<S> | null {
  if (!pathExists(file)) return null;
  let data: unknown;
  try {
    data = loadYaml(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new StateError(`${file}: invalid YAML (${(err as Error).message})`);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new StateError(
      `${file} does not satisfy steward.state.v1: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`
    );
  }
  return parsed.data;
}

export function writeYaml(file: string, value: unknown): void {
  ensureDir(file.replace(/[/\\][^/\\]+$/, ""));
  fs.writeFileSync(file, dumpYaml(value, { noRefs: true }), "utf8");
}

export function nowIso(): string {
  return new Date().toISOString();
}
