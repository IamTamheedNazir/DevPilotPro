import * as fs from "node:fs";
import { readMemories, replaceMemories, transitionMemory } from "./store.js";
import type { MemoryRecordT } from "./schema.js";
import { pathExists } from "../util/fs.js";
import { sha256 } from "../util/hash.js";
import { brainPaths } from "../brain/paths.js";
import { Ledger } from "../schema/ledger.js";
import { VERSION } from "../version.js";
import { isStewardOwned } from "../intel/impact.js";

/**
 * Memory freshness (Phase 5 §8): memory can lie after the project moves on.
 * When a memory's support files change or disappear, the memory is marked
 * STALE — a lower-authority observation, no longer silently applied as
 * project truth. Confirmation restores it.
 */

const ACTOR = `steward-core@${VERSION}`;

/** Digest of a memory's support files (content hashes, sorted). */
export function supportDigest(root: string, memory: MemoryRecordT): string | null {
  if (memory.supportFiles.length === 0) return null;
  const parts: string[] = [];
  for (const rel of [...memory.supportFiles].sort()) {
    if (isStewardOwned(rel)) continue;
    const abs = `${root}/${rel}`;
    if (!pathExists(abs)) {
      parts.push(`${rel}:absent`);
      continue;
    }
    try {
      parts.push(`${rel}:${sha256(fs.readFileSync(abs, "utf8"))}`);
    } catch {
      parts.push(`${rel}:unreadable`);
    }
  }
  return sha256(parts.join("\n"));
}

export interface FreshnessOutcome {
  checked: number;
  staled: string[];
  restored: string[];
}

/**
 * Re-evaluate freshness for all memories with support files. A memory whose
 * support digest changed since it was last confirmed is marked STALE; a
 * STALE memory whose support digest matches its recorded confirmation
 * digest (recorded in lastConfirmedAt metadata via the digest file) is
 * restored to ACTIVE.
 */
export function refreshMemoryFreshness(root: string): FreshnessOutcome {
  const file = readMemories(root);
  const digests = readDigests(root);
  const outcome: FreshnessOutcome = { checked: 0, staled: [], restored: [] };
  let changed = false;
  for (const m of file.memories) {
    if (m.supportFiles.length === 0) continue;
    if (m.status === "REJECTED" || m.status === "SUPERSEDED") continue;
    outcome.checked += 1;
    const current = supportDigest(root, m);
    if (current === null) continue;
    const recorded = digests.get(m.id);
    if (recorded === undefined) {
      // First observation: record the digest without staling anything.
      digests.set(m.id, { digest: current, at: nowIsoSafe() });
      changed = true;
      continue;
    }
    if (recorded.digest !== current) {
      if (m.status === "ACTIVE" || m.status === "CONFLICTED") {
        m.status = "STALE";
        outcome.staled.push(m.id);
        changed = true;
        // Keep the pre-change digest recorded: if the edit was transient and
        // the support files revert, the next pass sees the original digest
        // match and restores the memory. Re-recording here would make that
        // restore path unreachable.
      }
    } else if (m.status === "STALE") {
      // Support matches the recorded confirmation digest; the memory was
      // staled by a transient edit that has since reverted — restore it.
      m.status = "ACTIVE";
      m.lastConfirmedAt = nowIsoSafe();
      outcome.restored.push(m.id);
      changed = true;
    }
  }
  if (changed) {
    replaceMemories(root, file.memories);
    writeDigests(root, digests);
  }
  if (outcome.staled.length > 0 || outcome.restored.length > 0) {
    new Ledger(brainPaths(root).ledgerJsonl).append("memory.freshness", ACTOR, "memory", {
      staled: outcome.staled,
      restored: outcome.restored,
      checked: outcome.checked,
    });
  }
  return outcome;
}

export function confirmMemoryWithDigest(root: string, id: string): MemoryRecordT {
  const m = transitionMemory(root, id, "confirm", { by: "freshness" });
  const file = readMemories(root);
  const record = file.memories.find((x) => x.id === id)!;
  const digest = supportDigest(root, record);
  if (digest) {
    const digests = readDigests(root);
    digests.set(id, { digest, at: nowIsoSafe() });
    writeDigests(root, digests);
  }
  return m;
}

interface DigestEntry {
  digest: string;
  at: string;
}

function digestsFile(root: string): string {
  return `${memoryPaths(root).dir}/digests.json`;
}

function memoryPaths(root: string): { dir: string } {
  // Local re-declaration avoids a cycle with store.js.
  return { dir: `${root}/.steward/memory` };
}

function readDigests(root: string): Map<string, DigestEntry> {
  const p = digestsFile(root);
  if (!pathExists(p)) return new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, DigestEntry>;
    return new Map(Object.entries(raw));
  } catch {
    return new Map();
  }
}

function writeDigests(root: string, digests: Map<string, DigestEntry>): void {
  const p = digestsFile(root);
  fs.mkdirSync(p.replace(/[/\\][^/\\]+$/, ""), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(Object.fromEntries(digests), null, 2), "utf8");
}

function nowIsoSafe(): string {
  return new Date().toISOString();
}
