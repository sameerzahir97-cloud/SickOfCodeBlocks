// CLI argument parsing via Node's built-in util.parseArgs (no dependency).
// Maps flags + presets onto a SanitizeOptions object and resolves the input
// source / output targets.

import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { DEFAULTS, type SanitizeOptions, type TableMode } from "./pipeline.js";
import { presetPatch, type Preset } from "./presets.js";
import { loadConfig } from "./config.js";

// Polling cost is higher on Windows (each tick spawns PowerShell for the
// clipboard), so default to a slower poll there.
const DEFAULT_INTERVAL_MS = process.platform === "win32" ? 1500 : 800;

export type InputSource =
  | { kind: "file"; path: string }
  | { kind: "clip" }
  | { kind: "stdin" };

export interface ParsedCli {
  options: SanitizeOptions;
  source: InputSource;
  outFile?: string;
  toClipboard: boolean;
  watch: boolean;
  interval: number;
  quiet: boolean;
  showHelp: boolean;
  showVersion: boolean;
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

const TABLE_MODES = new Set<TableMode>(["reconstruct", "ascii", "strip", "keep"]);

export function getVersion(): string {
  try {
    const url = new URL("../package.json", import.meta.url);
    const pkg = JSON.parse(readFileSync(url, "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function parsePositiveInt(value: string, flag: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new UsageError(`${flag} expects a positive integer (got "${value}")`);
  }
  return n;
}

export function parseCli(argv: string[]): ParsedCli {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        clip: { type: "boolean", short: "c" },
        out: { type: "string", short: "o" },
        emulate: { type: "boolean", short: "e" },
        cols: { type: "string" },
        rows: { type: "string" },
        table: { type: "string", short: "t" },
        "no-links": { type: "boolean" },
        "strip-emoji": { type: "boolean" },
        "no-glyphs": { type: "boolean" },
        "keep-glyphs": { type: "boolean" },
        "no-fences": { type: "boolean" },
        "keep-fences": { type: "boolean" },
        markdown: { type: "boolean", short: "m" },
        "no-markdown": { type: "boolean" },
        html: { type: "boolean" },
        "no-html": { type: "boolean" },
        prompts: { type: "boolean" },
        "no-prompts": { type: "boolean" },
        reflow: { type: "boolean" },
        "no-reflow": { type: "boolean" },
        powershell: { type: "boolean" },
        ps: { type: "boolean" },
        "no-powershell": { type: "boolean" },
        "no-typographic": { type: "boolean" },
        arrows: { type: "boolean" },
        "expand-tabs": { type: "boolean" },
        "tab-width": { type: "string" },
        crlf: { type: "boolean" },
        "no-collapse-blanks": { type: "boolean" },
        redact: { type: "boolean", short: "r" },
        quiet: { type: "boolean", short: "q" },
        watch: { type: "boolean", short: "w" },
        interval: { type: "string" },
        slack: { type: "boolean" },
        teams: { type: "boolean" },
        email: { type: "boolean" },
        plain: { type: "boolean" },
        agent: { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    });
  } catch (e) {
    throw new UsageError((e as Error).message);
  }

  const v = parsed.values;
  const positionals = parsed.positionals;

  if (v.help) return baseResult({ showHelp: true });
  if (v.version) return baseResult({ showVersion: true });

  // Defaults, then config file, then preset, then explicit flags (explicit wins).
  let o: SanitizeOptions = { ...DEFAULTS, ...loadConfig() };
  const preset: Preset | null = v.plain
    ? "plain"
    : v.email
      ? "email"
      : v.slack
        ? "slack"
        : v.teams
          ? "teams"
          : v.agent
            ? "agent"
            : null;
  if (preset) o = { ...o, ...presetPatch(preset) };

  if (v.table !== undefined) {
    if (!TABLE_MODES.has(v.table as TableMode)) {
      throw new UsageError(
        `invalid --table mode "${v.table}" (use reconstruct|ascii|strip|keep)`,
      );
    }
    o.tableMode = v.table as TableMode;
  }
  if (v.emulate) o.emulate = true;
  if (v.cols !== undefined) o.emulateCols = parsePositiveInt(v.cols, "--cols");
  if (v.rows !== undefined) o.emulateRows = parsePositiveInt(v.rows, "--rows");
  if (v["no-links"]) o.hyperlinks = false;
  if (v["strip-emoji"]) o.stripEmoji = true;
  if (v["no-glyphs"] || v["keep-glyphs"]) o.stripGlyphs = false;
  if (v["no-fences"] || v["keep-fences"]) o.stripFences = false;
  if (v.markdown) o.markdown = true;
  if (v["no-markdown"]) o.markdown = false;
  if (v.html) o.html = true;
  if (v["no-html"]) o.html = false;
  if (v.prompts) o.prompts = true;
  if (v["no-prompts"]) o.prompts = false;
  if (v.reflow) o.reflow = true;
  if (v["no-reflow"]) o.reflow = false;
  if (v.powershell || v.ps) o.powershell = true;
  if (v["no-powershell"]) o.powershell = false;
  if (v["no-typographic"]) o.typographic = false;
  if (v.arrows) o.arrows = true;
  if (v["no-collapse-blanks"]) o.collapseBlankLines = false;
  if (v.crlf) o.newline = "crlf";
  if (v.redact) o.redact = true;
  if (v["tab-width"] !== undefined) {
    o.expandTabs = parsePositiveInt(v["tab-width"], "--tab-width");
  } else if (v["expand-tabs"]) {
    o.expandTabs = 4;
  }

  const first = positionals[0];
  const source: InputSource = first
    ? { kind: "file", path: first }
    : v.clip
      ? { kind: "clip" }
      : { kind: "stdin" };

  const interval =
    v.interval !== undefined
      ? parsePositiveInt(v.interval, "--interval")
      : DEFAULT_INTERVAL_MS;

  const result: ParsedCli = {
    options: o,
    source,
    toClipboard: Boolean(v.clip),
    watch: Boolean(v.watch),
    interval,
    quiet: Boolean(v.quiet),
    showHelp: false,
    showVersion: false,
  };
  if (v.out !== undefined) result.outFile = v.out;
  return result;
}

function baseResult(over: Partial<ParsedCli>): ParsedCli {
  return {
    options: { ...DEFAULTS },
    source: { kind: "stdin" },
    toClipboard: false,
    watch: false,
    interval: DEFAULT_INTERVAL_MS,
    quiet: false,
    showHelp: false,
    showVersion: false,
    ...over,
  };
}

export const HELP_TEXT = `socb - Sick Of Code Blocks
Convert raw terminal output into clean plain text for email / Slack / docs.

USAGE
  socb [options] [file]
  <command> | socb [options]
  socb --clip [options]

  Input priority:  [file] argument  >  --clip  >  piped stdin

OPTIONS
  -c, --clip            read from clipboard and write the result back to it
  -o, --out <file>      write result to <file> (default: stdout)
  -e, --emulate         render through a headless terminal (needs @xterm/headless);
                        use for multi-line redraws (docker, cargo, pip) and TUIs
      --cols <n>        emulator width  (default 200)
      --rows <n>        emulator height (default 600)
  -t, --table <mode>    reconstruct | ascii | strip | keep   (default: reconstruct)
      --no-links        do not rewrite OSC 8 hyperlinks to "text (url)"
      --strip-emoji     remove emoji, ZWJ sequences, variation selectors, skin tones
      --no-glyphs       keep Nerd Font / Private-Use glyphs (default strips them)
      --no-fences       keep Markdown code fences + PowerShell ~ underlines
                        (default strips these marker lines)
  -m, --markdown        flatten Markdown to readable text: headings, lists,
                        **bold**, [links](url) -> text (url); code kept verbatim
      --no-markdown     keep Markdown markup literal (the default)
      --html            strip HTML tags and decode entities (&amp; -> &)
      --prompts         strip leading shell prompts ($, PS C:\>, >>>)
      --reflow          rejoin hard-wrapped prose into flowing paragraphs
      --powershell, --ps  tidy pasted PowerShell errors (~ underlines + "+" gutter)
      --no-typographic  keep smart quotes / em-dashes / ellipsis (default -> ASCII)
      --arrows          also convert arrows  (-> for the right arrow, etc.)
      --expand-tabs     convert tabs to spaces (4 wide)
      --tab-width <n>   set tab width and expand tabs
      --crlf            emit CRLF line endings (default LF)
      --no-collapse-blanks  keep runs of blank lines
  -r, --redact          mask secrets/PII (API keys, JWTs, emails, IPs, home paths)
  -q, --quiet           in --clip mode, suppress the change summary on stderr
  -w, --watch           keep cleaning the clipboard in place (Ctrl+C to stop)
      --interval <ms>   --watch poll interval (default 800, 1500 on Windows)
  -h, --help            show this help
  -v, --version         show version

PRESETS  (apply a bundle; individual flags still override)
      --slack, --teams  chat apps: tables reconstructed, emoji + Markdown kept
      --email           flatten Markdown, strip tables/emoji/glyphs -> readable prose
      --plain           email preset + arrows + tabs->spaces (max compatibility)
      --agent           denoise for feeding output INTO a model: strip ANSI/box/
                        glyph noise, KEEP Markdown structure + Unicode (no folding)
      (--html, --prompts, --reflow, --powershell are opt-in, not in any preset)

CONFIG  (set persistent defaults so you don't repeat flags)
  ~/.socbrc.json  or  ./.socbrc.json , e.g.  { "redact": true, "tableMode": "strip" }
  Precedence:  built-in defaults < config file < preset < command-line flags.

EXAMPLES
  npm install | socb
  docker ps | socb --table ascii
  pytest | socb --redact > clean.txt
  socb --clip --redact
  socb --watch --redact          # auto-clean every copy until you stop it
  socb build.log --emulate

--redact is best-effort, not a security guarantee. Review output before sharing.
`;
