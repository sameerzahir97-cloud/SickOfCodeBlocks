import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadConfig,
  validate,
  setUserConfig,
  isFirstWatchRun,
  markWatchRunSeen,
} from "../../src/config.js";

const tmps: string[] = [];
function tmpConfig(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "socbrc-"));
  tmps.push(dir);
  const p = join(dir, ".socbrc.json");
  writeFileSync(p, content);
  return p;
}

afterEach(() => {
  while (tmps.length) rmSync(tmps.pop() as string, { recursive: true, force: true });
});

describe("validate", () => {
  it("keeps known, well-typed keys", () => {
    expect(
      validate({ redact: true, tableMode: "strip", expandTabs: 4 }),
    ).toEqual({ redact: true, tableMode: "strip", expandTabs: 4 });
  });
  it("drops unknown keys and wrong types", () => {
    expect(
      validate({ redact: "yes", nope: 1, tableMode: "bogus", emulateCols: -5 }),
    ).toEqual({});
  });
  it("accepts expandTabs:false and newline enum", () => {
    expect(validate({ expandTabs: false, newline: "crlf" })).toEqual({
      expandTabs: false,
      newline: "crlf",
    });
  });
  it("returns empty for non-objects", () => {
    expect(validate(null)).toEqual({});
    expect(validate("x")).toEqual({});
  });
});

describe("loadConfig", () => {
  it("reads and validates a config file", () => {
    const p = tmpConfig('{ "redact": true, "tableMode": "ascii" }');
    expect(loadConfig([p])).toEqual({ redact: true, tableMode: "ascii" });
  });
  it("ignores a missing file", () => {
    expect(loadConfig([join(tmpdir(), "definitely-missing-socbrc.json")])).toEqual({});
  });
  it("ignores invalid JSON without throwing", () => {
    const p = tmpConfig("{ not valid json ");
    expect(loadConfig([p])).toEqual({});
  });
  it("strips a leading UTF-8 BOM before parsing", () => {
    const p = tmpConfig(String.fromCharCode(0xfeff) + '{ "redact": true }');
    expect(loadConfig([p])).toEqual({ redact: true });
  });
  it("later paths override earlier ones", () => {
    const a = tmpConfig('{ "redact": true, "tableMode": "strip" }');
    const b = tmpConfig('{ "tableMode": "keep" }');
    expect(loadConfig([a, b])).toEqual({ redact: true, tableMode: "keep" });
  });
});

describe("setUserConfig", () => {
  it("writes a key while preserving existing ones", () => {
    const p = tmpConfig('{ "redact": true }');
    setUserConfig("markdown", false, p);
    expect(loadConfig([p])).toEqual({ redact: true, markdown: false });
  });
  it("creates the file when missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "socbrc-"));
    tmps.push(dir);
    const p = join(dir, ".socbrc.json");
    setUserConfig("tableMode", "strip", p);
    expect(loadConfig([p])).toEqual({ tableMode: "strip" });
  });
});

describe("first-run marker", () => {
  it("is true until marked, then false", () => {
    const dir = mkdtempSync(join(tmpdir(), "socb-state-"));
    tmps.push(dir);
    const p = join(dir, "state.json");
    expect(isFirstWatchRun(p)).toBe(true);
    markWatchRunSeen(p);
    expect(isFirstWatchRun(p)).toBe(false);
  });
});
