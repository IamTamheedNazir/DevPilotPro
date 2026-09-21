import * as fs from "node:fs";
import { brainPaths } from "../brain/paths.js";
import { Ledger } from "../schema/ledger.js";
import { nowIso } from "../state/store.js";
import { ensureIndex, type RepoIndex } from "../intel/index.js";
import { buildDependencyMap, transitiveDependents } from "../intel/graph.js";
import { sha256 } from "../util/hash.js";
import { pathExists } from "../util/fs.js";
import { listTasks } from "../state/tasks.js";
import { VERSION } from "../version.js";

/**
 * Evidence freshness: evidence older than the code it describes is stale.
 *
 * When verification or QA runs, Steward records a `surfaceHash` — a digest
 * of the relevant code surfaces (the feature's expected files plus their
 * transitive dependents). Gate evaluation recomputes the current surface
 * hash and compares: if relevant code changed after the evidence was
 * recorded, the evidence is STALE and the gate it supported reverts to
 * MISSING. A feature whose tests passed yesterday does not stay "verified"
 * today if the code moved on.
 */

const ACTOR = `steward-core@${VERSION}`;

export interface FreshnessStamp {
  surfaceHash: string;
  surfaces: string[];
  revision: string;
}

/**
 * Compute the freshness surface for a feature: the union of its tasks'
 * expected files plus their transitive dependents, sorted and hashed.
 */
export function freshnessSurface(root: string, featureId: string): FreshnessStamp {
  const index: RepoIndex = ensureIndex(root);
  const map = buildDependencyMap(index);
  const expected = [...new Set(listTasks(root, featureId).flatMap((t) => t.expectedFiles))]
    .map((f) => f.replace(/\\/g, "/"))
    .sort();

  const surfaces = new Set<string>();
  for (const file of expected) {
    surfaces.add(file);
    if (index.files.some((f) => f.path === file)) {
      for (const d of transitiveDependents(map, file)) surfaces.add(d);
    }
  }
  const sorted = [...surfaces].sort();
  const digest = sha256(
    sorted
      .map((f) => {
        const abs = `${root}/${f}`;
        if (!pathExists(abs)) return `${f}:absent`;
        try {
          return `${f}:${sha256(fs.readFileSync(abs, "utf8"))}`;
        } catch {
          return `${f}:unreadable`;
        }
      })
      .join("\n")
  );
  return { surfaceHash: digest, surfaces: sorted, revision: index.revision };
}

/** Attach a freshness stamp to evidence payloads (verification.run, review.*). */
export function stampPayload(
  root: string,
  featureId: string,
  payload: Record<string, unknown>
): Record<string, unknown> {
  try {
    const stamp = freshnessSurface(root, featureId);
    return { ...payload, surfaceHash: stamp.surfaceHash, surfaceCount: stamp.surfaces.length };
  } catch {
    return payload; // no index (e.g. fresh project) — evidence still valid
  }
}

export type EvidenceFreshness = "FRESH" | "STALE" | "NO_SURFACE" | "NO_EVIDENCE";

export interface FreshnessCheck {
  evidenceKind: string;
  freshness: EvidenceFreshness;
  detail: string;
  recordedSurfaceHash?: string;
  currentSurfaceHash?: string;
  recordedAt?: string;
}

/**
 * Determine whether the latest evidence of `kind` for a feature is still
 * fresh against the current code surface.
 */
export function checkFreshness(
  root: string,
  featureId: string,
  kind: "verification.run" | "review.qa" | "review.security"
): FreshnessCheck {
  const records = new Ledger(brainPaths(root).ledgerJsonl)
    .records()
    .filter((r) => r.kind === kind && r.payload?.["featureId"] === featureId);
  const latest = records[records.length - 1];
  if (!latest) {
    return { evidenceKind: kind, freshness: "NO_EVIDENCE", detail: "no evidence recorded" };
  }
  const recordedHash = latest.payload?.["surfaceHash"];
  if (typeof recordedHash !== "string") {
    return {
      evidenceKind: kind,
      freshness: "NO_SURFACE",
      detail: "evidence predates freshness stamping (no surfaceHash) — re-run to stamp",
      recordedAt: latest.ts,
    };
  }
  const current = freshnessSurface(root, featureId);
  if (current.surfaces.length === 0) {
    return {
      evidenceKind: kind,
      freshness: "NO_SURFACE",
      detail: "feature declares no expected files; freshness cannot be computed",
    };
  }
  if (current.surfaceHash === recordedHash) {
    return {
      evidenceKind: kind,
      freshness: "FRESH",
      detail: `surface unchanged since ${latest.ts} (${current.surfaces.length} files)`,
      recordedSurfaceHash: recordedHash,
      currentSurfaceHash: current.surfaceHash,
      recordedAt: latest.ts,
    };
  }
  return {
    evidenceKind: kind,
    freshness: "STALE",
    detail: `relevant code changed since ${latest.ts} — evidence is stale; re-run`,
    recordedSurfaceHash: recordedHash,
    currentSurfaceHash: current.surfaceHash,
    recordedAt: latest.ts,
  };
}

/** Record an explicit freshness invalidation (e.g. after a WIP change). */
export function invalidateEvidence(root: string, featureId: string, reason: string): void {
  new Ledger(brainPaths(root).ledgerJsonl).append("evidence.invalidated", ACTOR, featureId, {
    featureId,
    reason,
    at: nowIso(),
  });
}
