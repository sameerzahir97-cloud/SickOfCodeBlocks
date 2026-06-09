// Step 7 — box-drawing tables. Detect contiguous tabular blocks and re-render
// them per mode. Box-drawing detection uses numeric code points so the source
// stays pure ASCII.
//
//   reconstruct (default) : clean space-aligned columns, box chars removed
//   ascii                 : box glyphs -> + - |
//   strip                 : drop borders, keep cell text
//   keep                  : leave untouched

import type { TableMode } from "../pipeline.js";

const HAS_BOX = new RegExp("[\\u2500-\\u257F]"); // box-drawing block

function isBoxChar(cp: number): boolean {
  return cp >= 0x2500 && cp <= 0x257f;
}
function isBoxVertical(cp: number): boolean {
  return (
    cp === 0x2502 || // light vertical
    cp === 0x2503 || // heavy vertical
    cp === 0x2551 || // double vertical
    cp === 0x2506 ||
    cp === 0x2507 ||
    cp === 0x250a ||
    cp === 0x250b ||
    cp === 0x254e ||
    cp === 0x254f
  );
}
function isBoxHorizontal(cp: number): boolean {
  return (
    cp === 0x2500 ||
    cp === 0x2501 ||
    cp === 0x2550 ||
    cp === 0x2504 ||
    cp === 0x2505 ||
    cp === 0x2508 ||
    cp === 0x2509 ||
    cp === 0x254c ||
    cp === 0x254d
  );
}

/** A line made only of box chars / ASCII border chars / spaces (with >=1 border). */
export function isBorderRow(line: string): boolean {
  const t = line.trim();
  if (t === "") return false;
  let hasBorder = false;
  for (const ch of t) {
    const cp = ch.codePointAt(0) as number;
    if (isBoxChar(cp)) {
      hasBorder = true;
    } else if (ch === "+" || ch === "-" || ch === "=") {
      hasBorder = true;
    } else if (ch === "|" || ch === " " || ch === ":") {
      // separators / padding / Markdown alignment colons are allowed in a border
      // row but don't by themselves qualify it (":" only appears in "| :--: |")
    } else {
      return false;
    }
  }
  return hasBorder;
}

function lineHasVertical(line: string): boolean {
  let pipes = 0;
  for (const ch of line) {
    if (isBoxVertical(ch.codePointAt(0) as number)) return true;
    if (ch === "|") pipes += 1;
  }
  return pipes >= 2;
}

function isTabley(line: string): boolean {
  return lineHasVertical(line) || isBorderRow(line);
}

/** Split a row into trimmed cells on box-vertical or ASCII-pipe separators. */
export function splitCells(line: string): string[] {
  const parts: string[] = [];
  let cur = "";
  for (const ch of line) {
    const cp = ch.codePointAt(0) as number;
    if (isBoxVertical(cp) || ch === "|") {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  const trimmed = parts.map((c) => c.trim());
  // drop empty cells produced by leading/trailing edge separators
  if (trimmed.length && trimmed[0] === "") trimmed.shift();
  if (trimmed.length && trimmed[trimmed.length - 1] === "") trimmed.pop();
  return trimmed;
}

export interface TableBlock {
  start: number;
  end: number;
}

/** Find contiguous runs of table-like lines that look genuinely columnar. */
export function detectTableBlocks(lines: string[]): TableBlock[] {
  const blocks: TableBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!isTabley(lines[i] as string)) {
      i += 1;
      continue;
    }
    let j = i;
    let verticals = 0;
    let borders = 0;
    while (j < lines.length && isTabley(lines[j] as string)) {
      if (lineHasVertical(lines[j] as string)) verticals += 1;
      else borders += 1;
      j += 1;
    }
    const len = j - i;
    if (len >= 2 && (verticals >= 2 || (verticals >= 1 && borders >= 1))) {
      blocks.push({ start: i, end: j - 1 });
    }
    i = j;
  }
  return blocks;
}

function reconstruct(blockLines: string[]): string {
  const rows = blockLines
    .filter((l) => !isBorderRow(l))
    .map((l) => splitCells(l));
  if (rows.length === 0) return "";
  // Reduce (not Math.max(...spread)): a huge pasted table would overflow the
  // call-stack/arg limit and throw, which in --watch would kill the loop.
  let cols = 0;
  for (const r of rows) if (r.length > cols) cols = r.length;
  const widths: number[] = new Array(cols).fill(0);
  for (const r of rows) {
    for (let i = 0; i < cols; i++) {
      widths[i] = Math.max(widths[i] ?? 0, (r[i] ?? "").length);
    }
  }
  return rows
    .map((r) => {
      const cells: string[] = [];
      for (let i = 0; i < cols; i++) {
        cells.push((r[i] ?? "").padEnd(widths[i] ?? 0));
      }
      return cells.join("  ").replace(/\s+$/, "");
    })
    .join("\n");
}

function stripBorders(blockLines: string[]): string {
  return blockLines
    .filter((l) => !isBorderRow(l))
    .map((l) => splitCells(l).filter((c) => c !== "").join(" "))
    .join("\n");
}

function boxToAscii(line: string): string {
  if (!HAS_BOX.test(line)) return line;
  let out = "";
  for (const ch of line) {
    const cp = ch.codePointAt(0) as number;
    if (!isBoxChar(cp)) {
      out += ch;
    } else if (isBoxHorizontal(cp)) {
      out += "-";
    } else if (isBoxVertical(cp)) {
      out += "|";
    } else {
      out += "+"; // corners, tees, crosses
    }
  }
  return out;
}

function stripBoxChars(line: string): string {
  if (!HAS_BOX.test(line)) return line;
  let out = "";
  for (const ch of line) {
    if (!isBoxChar(ch.codePointAt(0) as number)) out += ch;
  }
  return out;
}

function handleNonTable(line: string, mode: TableMode): string {
  if (mode === "ascii") return boxToAscii(line);
  return stripBoxChars(line); // reconstruct | strip: remove stray box glyphs
}

function renderBlock(blockLines: string[], mode: TableMode): string {
  if (mode === "ascii") return blockLines.map(boxToAscii).join("\n");
  if (mode === "strip") return stripBorders(blockLines);
  return reconstruct(blockLines);
}

/** Detect and re-render box-drawing tables according to `mode`. */
export function transformTables(input: string, mode: TableMode): string {
  if (mode === "keep") return input;
  const lines = input.split("\n");
  const blocks = detectTableBlocks(lines);
  if (blocks.length === 0) {
    // still normalize stray box-drawing on every line
    return lines.map((l) => handleNonTable(l, mode)).join("\n");
  }
  const out: string[] = [];
  let idx = 0;
  for (const b of blocks) {
    for (; idx < b.start; idx++) out.push(handleNonTable(lines[idx] as string, mode));
    out.push(renderBlock(lines.slice(b.start, b.end + 1), mode));
    idx = b.end + 1;
  }
  for (; idx < lines.length; idx++) {
    out.push(handleNonTable(lines[idx] as string, mode));
  }
  return out.join("\n");
}
