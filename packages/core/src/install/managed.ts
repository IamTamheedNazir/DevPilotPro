import { VERSION } from "../version.js";

/**
 * Managed blocks let Steward add a self-owned section into a user-owned file
 * (AGENTS.md, GEMINI.md) without ever touching the rest of the file.
 */

export function beginMarker(blockId: string): string {
  return `<!-- steward:begin:${blockId} v${VERSION} -->`;
}

export function endMarker(blockId: string): string {
  return `<!-- steward:end:${blockId} -->`;
}

export function beginMarkerRegex(blockId: string): RegExp {
  return new RegExp(`<!-- steward:begin:${blockId}( v[0-9.]+)? -->`);
}

export function endMarkerRegex(blockId: string): RegExp {
  return new RegExp(`<!-- steward:end:${blockId} -->`);
}

export function buildBlock(blockId: string, markdown: string): string {
  return `${beginMarker(blockId)}\n${markdown.trim()}\n${endMarker(blockId)}`;
}

/** Insert or replace the managed block inside `existing` (may be null/empty). */
export function applyBlock(
  existing: string | null,
  blockId: string,
  markdown: string
): string {
  const block = buildBlock(blockId, markdown);
  const base = existing ?? "";
  const begin = beginMarkerRegex(blockId).exec(base);
  if (!begin) {
    const sep = base.length === 0 ? "" : base.endsWith("\n\n") ? "" : base.endsWith("\n") ? "\n" : "\n\n";
    return `${base}${sep}${block}\n`;
  }
  const rest = base.slice(begin.index);
  const end = endMarkerRegex(blockId).exec(rest);
  if (!end) {
    // Corrupted block: replace from begin to EOF.
    return `${base.slice(0, begin.index)}${block}\n`;
  }
  const before = base.slice(0, begin.index);
  const after = rest.slice(end.index + end[0].length);
  return `${before}${block}${after}`;
}

/** Remove the managed block; returns null if the file becomes empty. */
export function stripBlock(
  content: string,
  blockId: string
): string | null {
  const begin = beginMarkerRegex(blockId).exec(content);
  if (!begin) return content;
  const rest = content.slice(begin.index);
  const end = endMarkerRegex(blockId).exec(rest);
  if (!end) return `${content.slice(0, begin.index)}${rest.slice(0, 0)}`;
  const before = content.slice(0, begin.index);
  const after = rest.slice(end.index + end[0].length);
  const merged = `${before}${after}`.replace(/\n{3,}/g, "\n\n");
  return merged.trim().length === 0 ? null : merged;
}
