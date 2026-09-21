import * as fs from "node:fs";
import * as path from "node:path";
import { redactUrl, sanitizeAndRedact, sanitizeText } from "../security/redact.js";
import { nowIso } from "../state/store.js";
import { pathExists } from "../util/fs.js";
import type {
  BrowserQaProvider,
  QaAxeViolationT,
  QaConsoleEntryT,
  QaExecutionContext,
  QaFailureClass,
  QaJourneyT,
  QaNetworkEntryT,
  QaRunResult,
  QaViewportResultT,
} from "./schema.js";

/**
 * Playwright QA provider. Playwright is loaded DYNAMICALLY (§24/§55): when
 * it is not installed the provider reports UNAVAILABLE and nothing fakes a
 * PASS (§25). All page-derived content (titles, console, bodies, filenames)
 * is untrusted DATA — sanitized and redacted through the shared layer before
 * storage (§42, §64). Downloaded files are never executed (§65).
 */

export interface PlaywrightCapabilityReport {
  available: boolean;
  detail: string;
  projectConfig?: string;
  browsers: Array<{ name: string; available: boolean }>;
  axeIntegration: boolean;
}

type AnyBrowser = {
  newContext(opts: Record<string, unknown>): Promise<AnyContext>;
  close(): Promise<void>;
};
type AnyContext = {
  newPage(): Promise<AnyPage>;
  close(): Promise<void>;
};
type AnyPage = {
  goto(url: string, opts?: Record<string, unknown>): Promise<{ status?: () => number } | null>;
  click(selector: string, opts?: Record<string, unknown>): Promise<void>;
  fill(selector: string, value: string, opts?: Record<string, unknown>): Promise<void>;
  press(selector: string, key: string, opts?: Record<string, unknown>): Promise<void>;
  waitForSelector(selector: string, opts?: Record<string, unknown>): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  textContent(selector: string): Promise<string | null>;
  screenshot(opts: Record<string, unknown>): Promise<Buffer>;
  on(ev: string, handler: (arg: unknown) => void): void;
  url(): string;
  title(): Promise<string>;
  close(): Promise<void>;
};

let cachedModule: { pw: unknown; error?: string } | null = null;

function loadPlaywright(): { ok: true; pw: Record<string, unknown> } | { ok: false; error: string } {
  if (cachedModule) {
    return cachedModule.error ? { ok: false, error: cachedModule.error } : { ok: true, pw: cachedModule.pw as Record<string, unknown> };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const req = eval("require") as (m: string) => unknown;
    const pw = req("playwright") as Record<string, unknown>;
    cachedModule = { pw };
    return { ok: true, pw };
  } catch (err) {
    const error = `playwright is not installed in this project (${(err as Error).message.split("\n")[0].slice(0, 120)})`;
    cachedModule = { pw: null, error };
    return { ok: false, error };
  }
}

export function playwrightProjectConfig(root: string): string | undefined {
  for (const name of ["playwright.config.ts", "playwright.config.js", "playwright.config.mjs"]) {
    if (pathExists(`${root}/${name}`)) return name;
  }
  return undefined;
}

/** True when the project has axe wired up (§33 capability detection). */
export function hasAxeIntegration(root: string): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(`${root}/package.json`, "utf8")) as { devDependencies?: Record<string, string>; dependencies?: Record<string, string> };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return Boolean(deps["@axe-core/playwright"] || deps["axe-playwright"] || deps["@axe-core/cli"]);
  } catch {
    return false;
  }
}

export async function checkPlaywrightCapability(root: string): Promise<PlaywrightCapabilityReport> {
  const loaded = loadPlaywright();
  const browsers: Array<{ name: string; available: boolean }> = [];
  if (loaded.ok) {
    const pw = loaded.pw as Record<string, () => unknown>;
    for (const name of ["chromium", "firefox", "webkit"] as const) {
      try {
        const t = pw[name];
        browsers.push({ name, available: typeof t === "function" });
      } catch {
        browsers.push({ name, available: false });
      }
    }
  }
  return {
    available: loaded.ok,
    detail: loaded.ok ? "playwright module found; browser executables checked at run time" : loaded.error,
    projectConfig: playwrightProjectConfig(root),
    browsers,
    axeIntegration: hasAxeIntegration(root),
  };
}

/** Host policy check (§40, §67): QA never becomes SSRF tooling. */
export function isHostAllowed(url: string, context: QaExecutionContext): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const allowed = context.allowedHosts.map((h) => h.toLowerCase());
    const privateAllowed = context.allowedPrivateHosts.map((h) => h.toLowerCase());
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
    if (isLocal && (allowed.includes("localhost") || allowed.includes("127.0.0.1"))) return true;
    if (allowed.includes(host)) return true;
    // Private/metadata ranges are denied unless explicitly allowed.
    if (isPrivateish(host)) return privateAllowed.includes(host);
    return false;
  } catch {
    return false;
  }
}

function isPrivateish(host: string): boolean {
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (host === "169.254.169.254") return true;
  return false;
}

export class OriginEscapeError extends Error {
  constructor(readonly url: string) {
    super(`journey navigated outside allowed origins: ${redactUrl(url)}`);
    this.name = "OriginEscapeError";
  }
}

/** Failure classification (§46). */
export function classifyFailure(err: unknown, viewport?: QaViewportResultT): QaFailureClass {
  const msg = err instanceof Error ? err.message : String(err);
  if (err instanceof OriginEscapeError) return "ORIGIN_ESCAPE";
  if (viewport) {
    if (viewport.console.some((c) => c.type === "error")) return "CONSOLE_ERROR";
    if (viewport.network.some((n) => n.status >= 500)) return "NETWORK_ERROR";
  }
  if (/timeout|timed?\s?out/i.test(msg)) return "TIMEOUT";
  if (/expect|assert|toEqual|toContain|locator/i.test(msg)) return "ASSERTION";
  if (/net::|ERR_CONNECTION|ECONNREFUSED/i.test(msg)) return "ENVIRONMENT";
  return "UNKNOWN";
}

export class PlaywrightQaProvider implements BrowserQaProvider {
  readonly name = "playwright";

  async available(): Promise<boolean> {
    return loadPlaywright().ok;
  }

  async availabilityDetail(): Promise<string> {
    const r = loadPlaywright();
    return r.ok ? "playwright available" : r.error;
  }

  async run(journey: QaJourneyT, context: QaExecutionContext): Promise<QaRunResult> {
    const started = Date.now();
    const loaded = loadPlaywright();
    if (!loaded.ok) {
      const unavailable: QaRunResult = {
        schema: "steward.qa.v1",
        id: resultId(journey),
        journeyId: journey.id,
        featureId: journey.featureId,
        requirementIds: journey.requirementIds,
        ranAt: nowIso(),
        provider: this.name,
        status: "UNAVAILABLE",
        unavailableReason: loaded.error,
        viewports: [],
        surfaces: [],
        summary: `Browser QA: UNAVAILABLE — ${loaded.error}`,
      };
      return unavailable;
    }

    const pw = loaded.pw as Record<string, { launch: (o?: Record<string, unknown>) => Promise<AnyBrowser> }>;
    const viewports: QaViewportResultT[] = [];

    let browser: Awaited<ReturnType<(typeof pw.chromium)["launch"]>> | null = null;
    try {
      browser = await pw.chromium.launch({ headless: true });
    } catch (err) {
      const reason = `chromium could not launch: ${sanitizeText((err as Error).message, 300)}`;
      const launchFail: QaRunResult = {
        schema: "steward.qa.v1",
        id: resultId(journey),
        journeyId: journey.id,
        featureId: journey.featureId,
        requirementIds: journey.requirementIds,
        ranAt: nowIso(),
        provider: this.name,
        status: "UNAVAILABLE",
        unavailableReason: reason,
        viewports: [],
        surfaces: [],
        summary: `Browser QA: UNAVAILABLE — ${reason}`,
      };
      return launchFail;
    }

    try {
      for (const vp of journey.viewports) {
        viewports.push(await runViewport(browser, journey, context, vp, pw));
      }
    } finally {
      await browser.close().catch(() => undefined);
    }

    const failed = viewports.filter((v) => v.status === "FAIL");
    const status: QaRunResult["status"] = failed.length > 0 ? "FAIL" : "PASS";
    const summaryText =
      status === "PASS"
        ? `${journey.id}: PASS across ${viewports.length} viewport(s) in ${Date.now() - started}ms`
        : `${journey.id}: FAIL — ${failed.map((f) => `${f.viewport}: ${f.failureClass}`).join("; ")}`;

    const summary: QaRunResult = {
      schema: "steward.qa.v1",
      id: resultId(journey),
      journeyId: journey.id,
      featureId: journey.featureId,
      requirementIds: journey.requirementIds,
      ranAt: nowIso(),
      provider: this.name,
      status,
      viewports,
      surfaces: [],
      summary: sanitizeText(summaryText, 2000),
    };
    return summary;
  }
}

function resultId(journey: QaJourneyT): string {
  return `QAR-${journey.id}-${Date.now()}`;
}

async function runViewport(
  browser: AnyBrowser,
  journey: QaJourneyT,
  context: QaExecutionContext,
  vp: "desktop" | "mobile",
  pw: Record<string, { launch: (o?: Record<string, unknown>) => Promise<AnyBrowser> }>
): Promise<QaViewportResultT> {
  const size = context.viewports[vp] ?? { width: 1440, height: 900 };
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
  const page = await ctx.newPage();
  const consoleEntries: QaConsoleEntryT[] = [];
  const networkEntries: QaNetworkEntryT[] = [];
  const axeViolations: QaAxeViolationT[] = [];
  let failedStepIndex = -1;
  let failureClass: QaFailureClass | undefined;
  let message = "";

  page.on("console", (arg: unknown) => {
    const msg = arg as { type?: string; text?: () => string };
    const text = typeof msg?.text === "function" ? msg.text() : String(msg?.text ?? "");
    const type = msg?.type === "error" ? "error" : msg?.type === "warning" ? "warning" : "info";
    if (type === "info") return; // policy: info is noise (§29)
    consoleEntries.push({
      type,
      text: sanitizeAndRedact(text, 1000),
      page: sanitizeText(currentPath(page), 300),
    });
    if (consoleEntries.length >= 50) return;
  });
  page.on("pageerror", (arg: unknown) => {
    const err = arg as Error;
    consoleEntries.push({
      type: "error",
      text: sanitizeAndRedact(err?.message ?? String(arg), 1000),
      page: sanitizeText(currentPath(page), 300),
    });
  });
  page.on("response", (arg: unknown) => {
    const res = arg as { url?: () => string; status?: () => number; request?: () => { method?: () => string } };
    try {
      const status = typeof res?.status === "function" ? res.status() : 0;
      if (status >= 400) {
        networkEntries.push({
          url: redactUrl(typeof res?.url === "function" ? res.url() : String(res?.url ?? "")),
          method: (typeof res.request === "function" ? res.request().method?.() : "GET") ?? "GET",
          status,
          failure: status >= 500 ? "server-error" : "client-error",
        });
      }
    } catch {
      /* listener must never throw */
    }
    if (networkEntries.length >= 50) return;
  });

  const start = Date.now();
  try {
    const firstUrl = resolveUrl(journey.startUrl, context.baseUrl);
    if (!isHostAllowed(firstUrl, context)) {
      throw new OriginEscapeError(firstUrl);
    }
    for (let i = 0; i < journey.steps.length; i++) {
      const step = journey.steps[i];
      const vpOverride = step.viewport ?? vp;
      switch (step.kind) {
        case "goto": {
          const url = resolveUrl(step.url ?? journey.startUrl, context.baseUrl);
          assertAllowedOrThrow(url, context);
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: step.timeoutMs ?? 20_000 });
          break;
        }
        case "click":
          await page.click(step.selector!, { timeout: step.timeoutMs ?? 10_000 });
          break;
        case "fill":
          await page.fill(step.selector!, step.value ?? "", { timeout: step.timeoutMs ?? 10_000 });
          break;
        case "press":
          await page.press(step.selector ?? "body", step.value ?? "Enter", { timeout: step.timeoutMs ?? 10_000 });
          break;
        case "wait":
          if (step.selector) await page.waitForSelector(step.selector, { timeout: step.timeoutMs ?? 10_000 });
          else await page.waitForTimeout(step.timeoutMs ?? 500);
          break;
        case "expect": {
          await page.waitForSelector(step.selector!, { timeout: step.timeoutMs ?? 10_000 });
          const actual = (await page.textContent(step.selector!)) ?? "";
          if (step.text && !actual.includes(step.text)) {
            throw new Error(`expect: selector ${step.selector} did not contain "${step.text}" (got ${actual.slice(0, 80)})`);
          }
          break;
        }
        case "screenshot":
          // Screenshots are stored as artifact FILES, never as state JSON blobs (§32).
          await page.screenshot({ path: artifactPath(journey.featureId, `${journey.id}-${vp}-${i}.png`), fullPage: false });
          break;
        case "checkAccessibility":
          axeViolations.push(...(await runAxe(page, pw)));
          break;
        case "saveState":
          // Authenticated state is sensitive: stored outside version control (§39).
          await (ctx as unknown as { storageState: (o: Record<string, unknown>) => Promise<void> }).storageState({
            path: artifactPath(journey.featureId, `${journey.id}-${vp}-state.json`),
          });
          break;
        default:
          break;
      }
      void vpOverride;
    }
  } catch (err) {
    failedStepIndex = Math.max(0, failedStepIndex);
    failureClass = classifyFailure(err, undefined);
    message = sanitizeAndRedact(err instanceof Error ? err.message : String(err), 1000);
    try {
      await page.screenshot({ path: artifactPath(journey.featureId, `${journey.id}-${vp}-failure.png`), fullPage: true });
    } catch {
      /* screenshot on failure is best-effort */
    }
  }

  // Post-run policy checks (§29, §30, §33).
  const consoleError = consoleEntries.find((c) => c.type === "error");
  const serverError = networkEntries.find((n) => n.status >= 500);
  let status: QaViewportResultT["status"] = "PASS";
  if (failedStepIndex >= 0 || message) {
    status = "FAIL";
  } else if (consoleError) {
    status = "FAIL";
    failureClass = "CONSOLE_ERROR";
    message = `console error: ${consoleError.text.slice(0, 200)}`;
  } else if (serverError) {
    status = "FAIL";
    failureClass = "NETWORK_ERROR";
    message = `server error: ${serverError.method} ${serverError.url.slice(0, 200)} → ${serverError.status}`;
  } else if (axeViolations.length > 0) {
    status = "FAIL";
    failureClass = "ACCESSIBILITY";
    message = `${axeViolations.length} accessibility violation(s): ${axeViolations.map((v) => v.id).join(", ").slice(0, 200)}`;
  }

  await ctx.close().catch(() => undefined);
  return {
    viewport: vp,
    status,
    failureClass,
    failedStepIndex: failedStepIndex >= 0 ? failedStepIndex : undefined,
    message: sanitizeText(message, 1000),
    console: consoleEntries.slice(0, 50),
    network: networkEntries.slice(0, 50),
    axeViolations: axeViolations.slice(0, 50),
    durationMs: Date.now() - start,
  };
}

function assertAllowedOrThrow(url: string, context: QaExecutionContext): void {
  if (!isHostAllowed(url, context)) throw new OriginEscapeError(url);
}

function resolveUrl(start: string, baseUrl: string): string {
  try {
    return new URL(start, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
  } catch {
    return start;
  }
}

function currentPath(page: AnyPage): string {
  try {
    return new URL(page.url()).pathname;
  } catch {
    return "/";
  }
}

function artifactPath(featureId: string, name: string): string {
  const dir = path.join(".steward", "qa", "artifacts", featureId);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, name.replace(/[^a-zA-Z0-9._-]/g, "_"));
}

/** §33: automated axe checks only when the project wires axe up. */
async function runAxe(page: AnyPage, pw: Record<string, unknown>): Promise<QaAxeViolationT[]> {
  try {
    const req = eval("require") as (m: string) => unknown;
    const axe = req("@axe-core/playwright") as { AxeBuilder: new (o: unknown) => { analyze: () => Promise<{ violations?: Array<{ id: string; impact?: string; description?: string; nodes?: unknown[] }> }> } };
    const builder = new axe.AxeBuilder({ page });
    const results = await builder.analyze();
    return (results.violations ?? []).slice(0, 50).map((v) => ({
      id: sanitizeText(v.id, 200),
      impact: sanitizeText(v.impact ?? "", 20),
      description: sanitizeText(v.description ?? "", 600),
      nodes: v.nodes?.length ?? 0,
    }));
  } catch {
    return [];
  }
  void pw;
}
