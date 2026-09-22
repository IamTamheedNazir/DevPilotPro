import * as fs from "node:fs";
import {
  MEMORY_SCHEMA,
  MemoriesFile,
  MemoryRecord,
  type MemoriesFileT,
  type MemoryRecordT,
} from "./schema.js";
import { nowIso, readYaml, writeYaml } from "../state/store.js";
import { StateError } from "../state/ids.js";
import { stewardPaths } from "../state/paths.js";
import { brainPaths } from "../brain/paths.js";
import { Ledger } from "../schema/ledger.js";
import { VERSION } from "../version.js";
import { sanitizeAndRedact } from "../security/redact.js";

/**
 * Engineering memory store. Memory lives at .steward/memory/memories.yaml —
 * one human-readable, diffable file. All free-text is sanitized and secret-
 * redacted on ingest (memory must never become a secret exfiltration path),
 * ids are validated before use as path/key material, and every write lands
 * in the evidence ledger so memory changes have receipts.
 */

const ACTOR = `steward-core@${VERSION}`;

export const MEMORY_ID_RE = /^MEM-[A-Z0-9]{1,24}-\d{3}$/;

export function memoryPaths(root: string) {
  const dir = `${stewardPaths(root).dir}/memory`;
  return {
    dir,
    memoriesYaml: `${dir}/memories.yaml`,
  };
}

export function validateMemoryId(id: string): string {
  if (!MEMORY_ID_RE.test(id)) {
    throw new StateError(`invalid memory id '${id}': must match MEM-<AREA>-NNN`);
  }
  return id;
}

export function readMemories(root: string): MemoriesFileT {
  const p = memoryPaths(root).memoriesYaml;
  if (!fs.existsSync(p)) {
    return { schema: MEMORY_SCHEMA, version: 1, memories: [] };
  }
  const parsed = readYaml(p, MemoriesFile);
  return parsed ?? { schema: MEMORY_SCHEMA, version: 1, memories: [] };
}

function writeMemories(root: string, file: MemoriesFileT): void {
  writeYaml(memoryPaths(root).memoriesYaml, file);
}

function ledger(root: string): Ledger {
  return new Ledger(brainPaths(root).ledgerJsonl);
}

function nextMemoryId(existing: MemoryRecordT[], area: string): string {
  const safeArea = area.replace(/[^A-Z0-9]/g, "").slice(0, 24) || "GEN";
  let max = 0;
  for (const m of existing) {
    if (m.id.startsWith(`MEM-${safeArea}-`)) {
      const n = Number.parseInt(m.id.slice(`MEM-${safeArea}-`.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `MEM-${safeArea}-${String(max + 1).padStart(3, "0")}`;
}

export interface NewMemoryInput {
  area?: string;
  id?: string;
  kind: MemoryRecordT["kind"];
  title: string;
  statement: string;
  authority: MemoryRecordT["authority"];
  confidence?: MemoryRecordT["confidence"];
  status?: MemoryRecordT["status"];
  scopes: MemoryRecordT["scopes"];
  provenance: {
    kind: MemoryRecordT["provenance"]["kind"];
    actor?: string;
    basis?: string[];
    evidenceRef?: string;
  };
  supportFiles?: string[];
  related?: string[];
  supersedes?: string[];
  expiresAt?: string;
}

/** Ingest-time hygiene: statements/titles can never carry secrets or escapes. */
function hygienic(text: string, max: number): string {
  return sanitizeAndRedact(text, max);
}

export function addMemory(root: string, input: NewMemoryInput): MemoryRecordT {
  const file = readMemories(root);
  const id = input.id
    ? validateMemoryId(input.id)
    : nextMemoryId(file.memories, input.area ?? kindArea(input.kind));
  if (file.memories.some((m) => m.id === id)) {
    throw new StateError(`duplicate memory id '${id}'`);
  }
  for (const supId of input.supersedes ?? []) {
    if (!file.memories.some((m) => m.id === supId)) {
      throw new StateError(`memory '${id}' supersedes unknown memory '${supId}'`);
    }
  }
  const now = nowIso();
  const record = MemoryRecord.parse({
    id,
    kind: input.kind,
    title: hygienic(input.title, 200),
    statement: hygienic(input.statement, 2000),
    authority: input.authority,
    confidence: input.confidence ?? "inferred",
    status: input.status ?? (input.authority === "LEARNED_CANDIDATE" ? "CANDIDATE" : "ACTIVE"),
    scopes: input.scopes,
    provenance: {
      kind: input.provenance.kind,
      actor: input.provenance.actor ?? "unknown",
      basis: (input.provenance.basis ?? []).map((b) => hygienic(b, 300)),
      evidenceRef: input.provenance.evidenceRef,
      at: now,
    },
    supersedes: input.supersedes ?? [],
    supersededBy: [],
    supportFiles: (input.supportFiles ?? []).slice(0, 200),
    related: (input.related ?? []).slice(0, 50),
    createdAt: now,
    lastConfirmedAt: now,
    expiresAt: input.expiresAt,
  });
  // Mark superseded targets deterministically.
  for (const supId of record.supersedes) {
    const target = file.memories.find((m) => m.id === supId);
    if (target && target.status === "ACTIVE") {
      target.status = "SUPERSEDED";
      target.supersededBy = [...new Set([...target.supersededBy, id])];
      ledger(root).append("memory.status", ACTOR, supId, { status: "SUPERSEDED", by: id });
    }
  }
  file.memories.push(record);
  writeMemories(root, file);
  ledger(root).append("memory.recorded", ACTOR, id, {
    kind: record.kind,
    authority: record.authority,
    status: record.status,
    scopes: record.scopes,
  });
  return record;
}

function kindArea(kind: MemoryRecordT["kind"]): string {
  switch (kind) {
    case "decision":
      return "DEC";
    case "convention":
      return "CONV";
    case "root-cause":
      return "RC";
    case "lesson":
      return "LESSON";
    case "warning":
      return "WARN";
    case "environment":
      return "ENV";
    case "preference":
      return "PREF";
    case "workflow":
      return "FLOW";
    case "historical":
      return "HIST";
    default:
      return "FACT";
  }
}

export function getMemory(root: string, id: string): MemoryRecordT {
  validateMemoryId(id);
  const m = readMemories(root).memories.find((x) => x.id === id);
  if (!m) throw new StateError(`memory '${id}' not found`);
  return m;
}

export type MemoryLifecycleAction =
  | "accept"
  | "reject"
  | "confirm"
  | "conflict"
  | "stale"
  | "supersede";

/**
 * Deterministic lifecycle transitions. Only some moves are legal; agents
 * cannot resurrect rejected memory or silently accept their own candidates
 * above LEARNED_CANDIDATE authority.
 */
export function transitionMemory(
  root: string,
  id: string,
  action: MemoryLifecycleAction,
  opts: { by?: string; supersedesId?: string } = {}
): MemoryRecordT {
  const file = readMemories(root);
  const m = file.memories.find((x) => x.id === validateMemoryId(id));
  if (!m) throw new StateError(`memory '${id}' not found`);
  const from = m.status;

  const legal: Record<MemoryLifecycleAction, MemoryRecordT["status"][]> = {
    accept: ["CANDIDATE", "CONFLICTED", "STALE"],
    reject: ["CANDIDATE", "CONFLICTED", "STALE", "ACTIVE"],
    confirm: ["ACTIVE", "STALE", "CONFLICTED"],
    conflict: ["ACTIVE", "CANDIDATE"],
    stale: ["ACTIVE", "CONFIRMED" as never].filter((s): s is MemoryRecordT["status"] => s !== "CONFIRMED"),
    supersede: ["ACTIVE", "CANDIDATE", "STALE", "CONFLICTED"],
  };
  if (action === "supersede") {
    if (!opts.supersedesId) {
      throw new StateError("supersede requires supersedesId (the replacing memory)");
    }
    const replacement = file.memories.find((x) => x.id === opts.supersedesId);
    if (!replacement) {
      throw new StateError(`replacement memory '${opts.supersedesId}' not found`);
    }
    m.status = "SUPERSEDED";
    m.supersededBy = [...new Set([...m.supersededBy, replacement.id])];
  } else if (action === "stale") {
    if (from !== "ACTIVE") {
      throw new StateError(`illegal memory transition ${from} —stale→ (only ACTIVE memory goes stale)`);
    }
    m.status = "STALE";
  } else if (action === "accept") {
    if (!legal.accept.includes(from)) {
      throw new StateError(`illegal memory transition: cannot accept from ${from}`);
    }
    m.status = "ACTIVE";
    // Accepting a candidate cannot raise its authority above ACCEPTED_CONVENTION
    // — higher authority requires recorded evidence or human/project policy.
    if (m.authority === "LEARNED_CANDIDATE" || m.authority === "AGENT_OBSERVATION" || m.authority === "CONVERSATION") {
      m.authority = "ACCEPTED_CONVENTION";
    }
    m.lastConfirmedAt = nowIso();
  } else if (action === "reject") {
    if (!legal.reject.includes(from)) {
      throw new StateError(`illegal memory transition: cannot reject from ${from}`);
    }
    m.status = "REJECTED";
  } else if (action === "confirm") {
    if (!legal.confirm.includes(from)) {
      throw new StateError(`illegal memory transition: cannot confirm from ${from}`);
    }
    m.status = "ACTIVE";
    m.lastConfirmedAt = nowIso();
  } else if (action === "conflict") {
    if (!legal.conflict.includes(from)) {
      throw new StateError(`illegal memory transition: cannot mark CONFLICTED from ${from}`);
    }
    m.status = "CONFLICTED";
  }
  writeMemories(root, file);
  ledger(root).append("memory.status", ACTOR, id, {
    from,
    to: m.status,
    by: opts.by ?? "steward",
    action,
  });
  return m;
}

/** Persist an already-validated record list (used by freshness + conventions). */
export function replaceMemories(root: string, memories: MemoryRecordT[]): void {
  writeMemories(root, { schema: MEMORY_SCHEMA, version: 1, memories });
}
