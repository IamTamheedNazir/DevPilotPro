import { load as loadYaml } from "js-yaml";

export class FormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormatError";
  }
}

export interface FrontmatterDoc {
  data: unknown;
  body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/** Split a `---`-delimited YAML frontmatter document from its markdown body. */
export function splitFrontmatter(raw: string): FrontmatterDoc {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) {
    throw new FormatError(
      "missing YAML frontmatter: file must start with '---', a YAML block, then a closing '---'"
    );
  }
  let data: unknown;
  try {
    data = loadYaml(match[1]);
  } catch (err) {
    throw new FormatError(`invalid YAML frontmatter: ${(err as Error).message}`);
  }
  return { data, body: raw.slice(match[0].length) };
}
