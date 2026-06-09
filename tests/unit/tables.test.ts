import { describe, it, expect } from "vitest";
import {
  transformTables,
  splitCells,
  isBorderRow,
  detectTableBlocks,
} from "../../src/transforms/tables.js";

const cp = (...n: number[]) => String.fromCodePoint(...n);
const V = cp(0x2502); // |
const H = (n: number) => cp(0x2500).repeat(n); // ---
const TL = cp(0x250c),
  TR = cp(0x2510),
  BL = cp(0x2514),
  BR = cp(0x2518),
  LT = cp(0x251c),
  RT = cp(0x2524),
  TT = cp(0x252c),
  BT = cp(0x2534),
  XX = cp(0x253c);

const boxTable = [
  TL + H(4) + TT + H(5) + TR,
  V + " A  " + V + " BB  " + V,
  LT + H(4) + XX + H(5) + RT,
  V + " x  " + V + " y   " + V,
  BL + H(4) + BT + H(5) + BR,
].join("\n");

const mdTable = "| Name | Age |\n|------|-----|\n| Bob  | 30  |";

describe("table detection helpers", () => {
  it("splits a row into trimmed cells", () => {
    expect(splitCells(V + " A  " + V + " BB  " + V)).toEqual(["A", "BB"]);
    expect(splitCells("| Name | Age |")).toEqual(["Name", "Age"]);
  });
  it("recognizes border rows", () => {
    expect(isBorderRow(LT + H(4) + XX + H(5) + RT)).toBe(true);
    expect(isBorderRow("|------|-----|")).toBe(true);
    expect(isBorderRow("| data | row |")).toBe(false);
  });
  it("recognizes GitHub alignment delimiter rows (colons)", () => {
    expect(isBorderRow("| :--- | ---: |")).toBe(true);
    expect(isBorderRow("| :--: |")).toBe(true);
  });
  it("detects a contiguous table block", () => {
    expect(detectTableBlocks(boxTable.split("\n"))).toEqual([
      { start: 0, end: 4 },
    ]);
  });
});

describe("transformTables", () => {
  it("reconstructs a box-drawing table into aligned columns", () => {
    expect(transformTables(boxTable, "reconstruct")).toBe("A  BB\nx  y");
  });
  it("reconstructs a markdown/ASCII pipe table", () => {
    expect(transformTables(mdTable, "reconstruct")).toBe("Name  Age\nBob   30");
  });
  it("reconstructs a GitHub-aligned pipe table (colon delimiters)", () => {
    expect(transformTables("| A | B |\n| :-- | --: |\n| 1 | 2 |", "reconstruct")).toBe(
      "A  B\n1  2",
    );
  });
  it("converts box glyphs to ASCII borders", () => {
    expect(transformTables(TL + H(4) + TR, "ascii")).toBe("+----+");
  });
  it("strips borders, keeping cell text", () => {
    expect(transformTables(mdTable, "strip")).toBe("Name Age\nBob 30");
  });
  it("keep mode is identity", () => {
    expect(transformTables(boxTable, "keep")).toBe(boxTable);
  });
  it("removes stray box glyphs on non-table lines", () => {
    expect(transformTables("a " + H(3) + " b", "reconstruct")).toBe("a  b");
  });
  it("reconstructs a very large table without throwing (no Math.max spread)", () => {
    const rows = ["| a | b |", "|---|---|"];
    for (let i = 0; i < 100_000; i++) rows.push(`| ${i} | x |`);
    expect(() => transformTables(rows.join("\n"), "reconstruct")).not.toThrow();
  });
});
