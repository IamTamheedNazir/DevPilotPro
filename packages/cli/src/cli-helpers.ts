/**
 * CLI helpers for workflow commands.
 */

/** Parse 'scope[:target]' specs; unknown scopes fall back to project-wide. */
export type CliScope = "project" | "package" | "directory" | "file" | "feature";
const SCOPES: CliScope[] = ["project", "package", "directory", "file", "feature"];

export function parseScopes(
  specs: string[]
): Array<{ scope: CliScope; target: string }> {
  const out: Array<{ scope: CliScope; target: string }> = [];
  for (const spec of specs ?? []) {
    const idx = spec.indexOf(":");
    const rawScope = idx < 0 ? spec : spec.slice(0, idx);
    const target = idx < 0 ? "" : spec.slice(idx + 1);
    const scope = (SCOPES as string[]).includes(rawScope)
      ? (rawScope as CliScope)
      : "project";
    out.push({ scope, target });
  }
  return out.length > 0 ? out : [{ scope: "project", target: "" }];
}

/** Comma-separated CLI option → trimmed list. */
export function listOpt(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Repeated flag collector for commander (kept for parity). */
export function collect(_flag: string): (value: string, previous: string[]) => string[] {
  return (value: string, previous?: string[]) => [...(previous ?? []), value];
}
