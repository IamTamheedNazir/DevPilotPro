const enabled =
  process.stdout.isTTY === true && process.env.NO_COLOR === undefined;

function code(c: string, text: string): string {
  return enabled ? `\x1b[${c}m${text}\x1b[0m` : text;
}

export const out = {
  dim: (t: string) => code("2", t),
  bold: (t: string) => code("1", t),
  green: (t: string) => code("32", t),
  yellow: (t: string) => code("33", t),
  red: (t: string) => code("31", t),
  cyan: (t: string) => code("36", t),
};

export function printStatusLine(
  icon: "pass" | "warn" | "fail" | "unknown",
  text: string
): void {
  const icons = {
    pass: out.green("✔"),
    warn: out.yellow("▲"),
    fail: out.red("✖"),
    unknown: out.dim("·"),
  } as const;
  console.log(`  ${icons[icon]} ${text}`);
}

export function printChecks(
  checks: Array<{ id: string; status: string; detail: string; hint?: string }>
): void {
  for (const c of checks) {
    const icon =
      c.status === "pass"
        ? "pass"
        : c.status === "warn"
          ? "warn"
          : c.status === "fail"
            ? "fail"
            : "unknown";
    printStatusLine(icon, `${c.id.padEnd(20)} ${c.detail}`);
    if (c.hint) console.log(out.dim(`    ↳ ${c.hint}`));
  }
}
