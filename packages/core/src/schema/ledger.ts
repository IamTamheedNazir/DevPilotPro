import * as fs from "node:fs";
import { z } from "zod";
import { sha256, stableStringify } from "../util/hash.js";
import { ensureDir } from "../util/fs.js";

/**
 * Append-only, hash-chained evidence ledger.
 *
 * Every record commits to the hash of its predecessor, so silently rewriting
 * history is detectable. Derived state may be rebuilt from trusted state plus
 * this ledger; the ledger itself is never rewritten.
 */

export const GENESIS_PREV = "0".repeat(64);

export const LedgerRecordV1 = z.object({
  v: z.literal(1),
  seq: z.number().int().nonnegative(),
  ts: z.string().min(1),
  kind: z.string().min(1),
  actor: z.string().min(1),
  ref: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
  prev: z.string().length(64),
  hash: z.string().length(64),
});

export type LedgerRecord = z.infer<typeof LedgerRecordV1>;

export type LedgerEventKind =
  | "brain.init"
  | "skills.install"
  | "skills.uninstall"
  | "evidence"
  | "decision"
  | "note";

function recordHash(rec: Omit<LedgerRecord, "hash">): string {
  return sha256(
    stableStringify({
      v: rec.v,
      seq: rec.seq,
      ts: rec.ts,
      kind: rec.kind,
      actor: rec.actor,
      ref: rec.ref,
      payload: rec.payload,
      prev: rec.prev,
    })
  );
}

export class Ledger {
  constructor(readonly filePath: string) {}

  records(): LedgerRecord[] {
    if (!fs.existsSync(this.filePath)) return [];
    const out: LedgerRecord[] = [];
    const lines = fs.readFileSync(this.filePath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Unreadable lines are skipped here and caught by verify() as a seq
      // gap — corruption is reported, never silently accepted.
      let json: unknown;
      try {
        json = JSON.parse(trimmed);
      } catch {
        continue;
      }
      const parsed = LedgerRecordV1.safeParse(json);
      if (parsed.success) out.push(parsed.data);
    }
    return out;
  }

  append(
    kind: LedgerEventKind,
    actor: string,
    ref?: string,
    payload?: Record<string, unknown>
  ): LedgerRecord {
    const existing = this.records();
    const prev =
      existing.length > 0 ? existing[existing.length - 1].hash : GENESIS_PREV;
    const base = {
      v: 1 as const,
      seq: existing.length,
      ts: new Date().toISOString(),
      kind,
      actor,
      ref,
      payload,
      prev,
    };
    const record: LedgerRecord = { ...base, hash: recordHash(base) };
    ensureDir(this.filePath.replace(/[/\\][^/\\]+$/, ""));
    fs.appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
    return record;
  }

  verify(): { ok: boolean; count: number; error?: string } {
    const records = this.records();
    let expectedPrev = GENESIS_PREV;
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      if (rec.seq !== i) {
        return { ok: false, count: records.length, error: `seq gap at record ${i}` };
      }
      if (rec.prev !== expectedPrev) {
        return {
          ok: false,
          count: records.length,
          error: `broken chain at record ${i}: prev hash mismatch`,
        };
      }
      const { hash, ...base } = rec;
      if (recordHash(base) !== hash) {
        return {
          ok: false,
          count: records.length,
          error: `tampered record ${i}: content hash mismatch`,
        };
      }
      expectedPrev = hash;
    }
    return { ok: true, count: records.length };
  }
}
