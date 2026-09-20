import { describe, expect, it } from "vitest";
import {
  applyBlock,
  buildBlock,
  stripBlock,
} from "../src/install/managed.js";

const ID = "skills-index";

describe("applyBlock", () => {
  it("appends the block to an existing doc", () => {
    const result = applyBlock("# My AGENTS.md\n\nuser content\n", ID, "index content");
    expect(result).toContain("# My AGENTS.md");
    expect(result).toContain("user content");
    expect(result).toContain("<!-- steward:begin:skills-index");
    expect(result).toContain("index content");
    expect(result).toContain("<!-- steward:end:skills-index -->");
  });

  it("creates a doc from nothing", () => {
    const result = applyBlock(null, ID, "index content");
    expect(result).toBe(buildBlock(ID, "index content") + "\n");
  });

  it("replaces an existing block in place, preserving surrounding content", () => {
    const first = applyBlock("# Header\n\nintro\n", ID, "old content");
    const second = applyBlock(first, ID, "new content");
    expect(second).toContain("new content");
    expect(second).not.toContain("old content");
    expect(second).toContain("# Header");
    expect(second).toContain("intro");
    // exactly one block remains
    expect(second.match(/steward:begin:skills-index/g)?.length).toBe(1);
  });

  it("repairs a corrupted block missing its end marker", () => {
    const corrupted = "# Header\n<!-- steward:begin:skills-index v0.1.0 -->\npartial";
    const result = applyBlock(corrupted, ID, "fixed");
    expect(result).toContain("fixed");
    expect(result).toContain("<!-- steward:end:skills-index -->");
  });
});

describe("stripBlock", () => {
  it("removes the block and preserves surrounding content", () => {
    const doc = applyBlock("# Header\n\nintro\n", ID, "block content");
    const stripped = stripBlock(doc, ID);
    expect(stripped).toContain("# Header");
    expect(stripped).toContain("intro");
    expect(stripped).not.toContain("block content");
    expect(stripped).not.toContain("steward:");
  });

  it("returns null when the file becomes empty", () => {
    const doc = applyBlock(null, ID, "only content");
    expect(stripBlock(doc, ID)).toBeNull();
  });

  it("returns content unchanged when no block is present", () => {
    expect(stripBlock("no markers here\n", ID)).toBe("no markers here\n");
  });
});
