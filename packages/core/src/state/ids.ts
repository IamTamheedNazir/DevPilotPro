/**
 * Strict ID validation. IDs are used as filesystem path segments, so they
 * must never be able to traverse, escape, or inject paths (see section 28).
 */

export class StateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StateError";
  }
}

/** Feature ids are lowercase kebab slugs, 1-64 chars. */
export const FEATURE_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** Requirement ids: REQ-<AREA>-<NNN>, e.g. REQ-INVITE-001 (area is alphanumeric). */
export const REQUIREMENT_ID_RE = /^REQ-[A-Z][A-Z0-9]{0,23}-\d{3}$/;
/** Task ids: TASK-<NNN>, unique within a feature. */
export const TASK_ID_RE = /^TASK-\d{3}$/;
/** Review finding ids: REV-<NNN>. */
export const REVIEW_ID_RE = /^REV-\d{3}$/;
/** Debug session ids: DEBUG-<NNN>. */
export const DEBUG_ID_RE = /^DEBUG-\d{3}$/;

export function validateFeatureId(id: string): string {
  if (!FEATURE_ID_RE.test(id)) {
    throw new StateError(
      `invalid feature id '${id}': must match ${FEATURE_ID_RE} (lowercase kebab slug, no slashes or dots)`
    );
  }
  return id;
}

export function validateRequirementId(id: string): string {
  if (!REQUIREMENT_ID_RE.test(id)) {
    throw new StateError(
      `invalid requirement id '${id}': must match ${REQUIREMENT_ID_RE}`
    );
  }
  return id;
}

export function validateTaskId(id: string): string {
  if (!TASK_ID_RE.test(id)) {
    throw new StateError(`invalid task id '${id}': must match ${TASK_ID_RE}`);
  }
  return id;
}

export function validateReviewId(id: string): string {
  if (!REVIEW_ID_RE.test(id)) {
    throw new StateError(`invalid review id '${id}': must match ${REVIEW_ID_RE}`);
  }
  return id;
}

export function validateDebugId(id: string): string {
  if (!DEBUG_ID_RE.test(id)) {
    throw new StateError(`invalid debug id '${id}': must match ${DEBUG_ID_RE}`);
  }
  return id;
}

/** Derive a feature id slug from a free-form title. */
export function slugifyFeature(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
  if (!FEATURE_ID_RE.test(slug)) {
    throw new StateError(`cannot derive a valid feature id from '${title}'`);
  }
  return slug;
}

/** Next NNN for a list of existing ids sharing the same prefix (REQ-AREA-, TASK-). */
export function nextNumberFor(prefix: string, existingIds: string[]): string {
  let max = 0;
  for (const id of existingIds) {
    if (id.startsWith(`${prefix}-`) || id.startsWith(prefix)) {
      const n = Number.parseInt(id.slice(prefix.length + (id.startsWith(`${prefix}-`) ? 1 : 0)), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return String(max + 1).padStart(3, "0");
}
