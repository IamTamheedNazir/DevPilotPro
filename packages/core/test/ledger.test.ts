import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { GENESIS_PREV, Ledger } from "../src/schema/ledger.js";

function tmpLedger(): Ledger {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "steward-ledger-"));
  return new Ledger(path.join(dir, "ledger.jsonl"));
}

describe("Ledger", () => {
  it("starts empty and verifies a genesis-only state", () => {
    const ledger = tmpLedger();
    expect(ledger.records()).toEqual([]);
    expect(ledger.verify()).toEqual({ ok: true, count: 0 });
  });

  it("chains records with seq and prev hash", () => {
    const ledger = tmpLedger();
    const a = ledger.append("brain.init", "test");
    const b = ledger.append("evidence", "test", "TASK-001", { ok: true });
    expect(a.seq).toBe(0);
    expect(a.prev).toBe(GENESIS_PREV);
    expect(b.seq).toBe(1);
    expect(b.prev).toBe(a.hash);
    const v = ledger.verify();
    expect(v.ok).toBe(true);
    expect(v.count).toBe(2);
  });

  it("detects tampering with a record payload", () => {
    const ledger = tmpLedger();
    ledger.append("brain.init", "test");
    const tamperedPath = ledger.filePath;
    const lines = fs.readFileSync(tamperedPath, "utf8").trimEnd().split("\n");
    const rec = JSON.parse(lines[0]);
    rec.payload = { hacked: true };
    fs.writeFileSync(tamperedPath, `${JSON.stringify(rec)}\n`);
    const v = ledger.verify();
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/tampered record 0/);
  });

  it("detects a broken prev-hash chain", () => {
    const ledger = tmpLedger();
    ledger.append("brain.init", "test");
    ledger.append("evidence", "test");
    const lines = fs.readFileSync(ledger.filePath, "utf8").trimEnd().split("\n");
    // replace record 0 with a different valid-format record
    const rec0 = JSON.parse(lines[0]);
    rec0.kind = "note";
    fs.writeFileSync(ledger.filePath, `${JSON.stringify(rec0)}\n${lines[1]}\n`);
    const v = ledger.verify();
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/chain|tampered/);
  });

  it("skips blank lines and invalid records when reading", () => {
    const ledger = tmpLedger();
    ledger.append("brain.init", "test");
    fs.appendFileSync(ledger.filePath, "\n");
    fs.appendFileSync(ledger.filePath, "not json\n");
    fs.appendFileSync(ledger.filePath, `${JSON.stringify({ v: 9 })}\n`);
    expect(ledger.records().length).toBe(1);
    expect(ledger.verify().ok).toBe(true);
  });
});
