// Optional config file for persistent default options, so users don't have to
// pass flags like --redact every time.
//
// Looked up in this order (later overrides earlier):
//   ~/.socbrc.json   (per-user)
//   ./.socbrc.json   (per-project, current working directory)
//
// Precedence overall: built-in DEFAULTS < config file < preset < CLI flags.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SanitizeOptions, TableMode, Newline } from "./pipeline.js";

const TABLE_MODES: readonly TableMode[] = ["reconstruct", "ascii", "strip", "keep"];
const NEWLINES: readonly Newline[] = ["lf", "crlf"];

export function configPaths(): string[] {
  return [join(homedir(), ".socbrc.json"), join(process.cwd(), ".socbrc.json")];
}

/** Read and validate config files, returning a partial options bundle. */
export function loadConfig(paths: string[] = configPaths()): Partial<SanitizeOptions> {
  let merged: Partial<SanitizeOptions> = {};
  for (const path of paths) {
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      continue; // missing file is normal
    }
    // Strip a leading BOM (Windows editors / PowerShell add one) so JSON.parse works.
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      process.stderr.write(`warning: ignoring invalid JSON in ${path}\n`);
      continue;
    }
    merged = { ...merged, ...validate(parsed) };
  }
  return merged;
}

/** Keep only known keys with the correct type; silently drop anything else. */
export function validate(obj: unknown): Partial<SanitizeOptions> {
  if (!obj || typeof obj !== "object") return {};
  const o = obj as Record<string, unknown>;
  const out: Partial<SanitizeOptions> = {};

  const bools: Array<keyof SanitizeOptions> = [
    "redact",
    "stripGlyphs",
    "stripFences",
    "stripEmoji",
    "typographic",
    "arrows",
    "hyperlinks",
    "collapseBlankLines",
    "emulate",
  ];
  for (const k of bools) {
    if (typeof o[k] === "boolean") (out as Record<string, unknown>)[k] = o[k];
  }

  if (typeof o["tableMode"] === "string" && TABLE_MODES.includes(o["tableMode"] as TableMode)) {
    out.tableMode = o["tableMode"] as TableMode;
  }
  if (typeof o["newline"] === "string" && NEWLINES.includes(o["newline"] as Newline)) {
    out.newline = o["newline"] as Newline;
  }
  if (
    o["expandTabs"] === false ||
    (typeof o["expandTabs"] === "number" &&
      Number.isInteger(o["expandTabs"]) &&
      o["expandTabs"] > 0)
  ) {
    out.expandTabs = o["expandTabs"] as number | false;
  }

  const nums: Array<keyof SanitizeOptions> = ["emulateCols", "emulateRows", "maxLineLength"];
  for (const k of nums) {
    const val = o[k];
    if (typeof val === "number" && Number.isInteger(val) && val > 0) {
      (out as Record<string, unknown>)[k] = val;
    }
  }

  return out;
}
