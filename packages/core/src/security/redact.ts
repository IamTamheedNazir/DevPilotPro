import { sha256 } from "../util/hash.js";

/**
 * ONE shared redaction + sanitization layer (Phase 4 §11, §63, §64).
 *
 * Everything that could carry secrets or untrusted content flows through
 * here before being persisted or shown: command output, security findings,
 * scanner output, page titles, console logs, HTTP bodies, error messages.
 * There must never be a second, weaker copy of this logic.
 */

const SECRET_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "Stripe secret key", re: /\b(sk_live_|sk_test_|rk_live_|rk_test_)[A-Za-z0-9]{8,}/g },
  { label: "Stripe publishable key", re: /\b(pk_(?:live|test)_)[A-Za-z0-9]{8,}/g },
  { label: "Stripe restricted key", re: /\brk_[A-Za-z0-9]{16,}/g },
  { label: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { label: "AWS secret", re: /\b(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g },
  { label: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}/g },
  { label: "GitHub fine-grained token", re: /\bgithub_pat_[A-Za-z0-9_]{20,}/g },
  { label: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  { label: "Google API key", re: /\bAIza[0-9A-Za-z_-]{30,}/g },
  { label: "OpenAI secret key", re: /\bsk-proj-[A-Za-z0-9_-]{20,}/g },
  { label: "Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { label: "Private key material", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY(?: BLOCK)?-----/g },
  { label: "JWT", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { label: "Authorization header", re: /\bBearer\s+[A-Za-z0-9._-]{16,}/gi },
  { label: "Basic auth header", re: /\bBasic\s+[A-Za-z0-9+/=]{16,}/gi },
  { label: "Credential assignment", re: /\b(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret)\b\s*[=:]\s*["']?[^\s"']{4,}["']?/gi },
  { label: "Connection string with credentials", re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s@/]+@[^\s]+/gi },
];

export interface RedactionHit {
  label: string;
  /** Position of the secret's start in the ORIGINAL string. */
  index: number;
}

/**
 * Redact likely secrets from untrusted text. Every secret is replaced with
 * `[REDACTED:<label>]`; the secret's own characters never survive.
 */
export function redactSecrets(text: string): string {
  let out = text;
  for (const { label, re } of SECRET_PATTERNS) {
    re.lastIndex = 0;
    out = out.replace(re, `[REDACTED:${label.replace(/\s+/g, "_").toUpperCase()}]`);
  }
  return out;
}

/** Find (without exposing) secrets in text — used by the secret scanner. */
export function findSecrets(text: string): RedactionHit[] {
  const hits: RedactionHit[] = [];
  for (const { label, re } of SECRET_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      hits.push({ label, index: m.index });
      if (m.index === re.lastIndex) re.lastIndex++;
      if (hits.length >= 200) return hits; // bounded
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

/** Type of a detected secret, from its label (e.g. "Stripe secret key"). */
export function secretTypeOf(hit: RedactionHit, text: string): string {
  void text;
  return hit.label;
}

const ANSI_RE = /\x1b(?:\[[0-9;]*[A-Za-z]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[()][0-9A-B]|\[[0-9;]*m)/g;
// Strip C0 control characters except \n and \t.
const CONTROL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

/**
 * Sanitize untrusted text (scanner output, page titles, console messages,
 * HTTP bodies): remove terminal escape sequences and control characters,
 * neutralize markdown/agent-injection framing, and bound length. Text that
 * survives this function is DATA, never instructions (§42, §63, §64).
 */
export function sanitizeText(text: string, max = 2000): string {
  let out = String(text ?? "");
  out = out.replace(ANSI_RE, "");
  out = out.replace(CONTROL_RE, "");
  // Collapse the classic "SYSTEM:" / "IGNORE PREVIOUS" framings so injected
  // page content cannot read like control-plane prose. Content is data; we
  // additionally tag it to make injection attempts visible in evidence.
  out = out
    .replace(/\bSYSTEM\s*:/gi, "SYSTEM→")
    .replace(/\bIGNORE (?:ALL )?PREVIOUS(?: INSTRUCTIONS)?/gi, "IGNORED-INJECTED-TEXT")
    .replace(/\bYOU ARE NOW\b/gi, "CLAIMED-BUT-IGNORED:")
    .replace(/\bDISREGARD (?:ALL )?(?:PREVIOUS|ABOVE)\b/gi, "CLAIMED-BUT-IGNORED:");
  out = out.trimEnd();
  if (out.length > max) {
    out = `${out.slice(0, Math.floor(max * 0.7))}\n… [${out.length - Math.floor(max * 0.9)} chars truncated] …\n${out.slice(-Math.floor(max * 0.2))}`;
  }
  return out;
}

/** Redact then sanitize — the default pipeline for any untrusted text. */
export function sanitizeAndRedact(text: string, max = 2000): string {
  return redactSecrets(sanitizeText(text, max));
}

/** A stable digest of redacted content — safe to store, identifies the text. */
export function redactedDigest(text: string): string {
  return sha256(redactSecrets(sanitizeText(text, 100_000))).slice(0, 16);
}

/**
 * Redact a URL for display: userinfo credentials are removed, query values
 * that look like tokens are masked, the structure is kept.
 */
export function redactUrl(url: string): string {
  let out = url.replace(/(^[a-z][a-z0-9+.-]*:\/\/)([^@\s/]+)@/i, "$1[REDACTED]@");
  out = out.replace(/([?&](?:token|api_?key|key|secret|access_token|sig|signature|password)=)[^&\s]+/gi, "$1[REDACTED]");
  return out;
}
