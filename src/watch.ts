// Clipboard watch mode: run once and keep cleaning the clipboard in place, so
// users never have to invoke the tool per-copy. Copy messy output (or a Markdown
// answer) anywhere and it is flattened/sanitized the next poll, ready to paste
// into Slack, Teams, email, or a Jira ticket.
//
// In watch mode the CLI defaults to flattening everything (Markdown included);
// see options.ts. Pass --only-messy to restore the conservative "terminal output
// only" gate. The loop is interactive on a TTY (m/r/p/s/u/?/q) and resilient: a
// single bad copy can never kill it.

import { sanitize, type SanitizeOptions } from "./pipeline.js";
import { readClipboard, writeClipboard } from "./io/clipboard.js";
import { changeStats } from "./io/summary.js";
import { detect, contentLabel } from "./io/detect.js";
import { startKeyListener } from "./io/keys.js";
import { isFirstWatchRun, markWatchRunSeen } from "./config.js";

export interface WatchState {
  /** Normalized last-seen / last-written clipboard value (the dedup key). */
  last: string;
  /** Pre-clean original of our last write, so `u` can restore it. */
  lastOriginal?: string | null;
}

export type TickResult = "skip" | "cleaned" | "already-clean" | "would-clean";

export interface WatchTickHooks {
  /** If provided and it returns false, the clipboard value is left untouched. */
  shouldProcess?: (s: string) => boolean;
  /** If it returns true, this tick is skipped entirely (e.g. paused). */
  paused?: () => boolean;
  /** If it returns true (consuming a one-shot flag), this copy is left untouched. */
  skipOnce?: () => boolean;
  /** If it returns true, compute the result but never write the clipboard. */
  dryRun?: () => boolean;
  /** Called after a cleaned / would-clean / (verbose) already-clean tick. */
  onResult?: (result: TickResult, raw: string, cleaned: string) => void;
}

// C0 controls (incl. ESC 0x1B; excludes \t \n \r) + box-drawing + Nerd-Font PUA.
const MESSY = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u2500-\\u257F\\uE000-\\uF8FF]",
);
const CR_REDRAW = new RegExp("\\r(?!\\n|$)"); // carriage return mid-line = progress redraw

/** Heuristic: does this clipboard text look like raw terminal output worth cleaning? */
export function looksMessy(s: string): boolean {
  return MESSY.test(s) || CR_REDRAW.test(s);
}

// Compare on normalized newlines so a CRLF/LF clipboard round-trip (common on
// Windows) never makes our own LF output look "new" and rewrite forever.
const normalizeNewlines = (s: string): string => s.replace(/\r\n?/g, "\n");

/**
 * One watch iteration. Pure w.r.t. its injected I/O so it can be unit-tested.
 * Loop-safe: after we write a cleaned value we remember it (sanitize is
 * idempotent), so our own write is never reprocessed.
 */
export async function watchTick(
  read: () => string,
  write: (s: string) => void,
  sanitizeFn: (s: string) => Promise<string>,
  state: WatchState,
  hooks: WatchTickHooks = {},
): Promise<TickResult> {
  if (hooks.paused?.()) return "skip"; // paused: don't read, don't remember

  let current: string;
  try {
    current = read();
  } catch {
    return "skip"; // transient clipboard read failure; try again next tick
  }

  const key = normalizeNewlines(current);
  if (current === "" || key === state.last) return "skip";

  if (hooks.skipOnce?.()) {
    state.last = key; // honor a one-shot skip; remember it so we don't reprocess
    return "skip";
  }

  if (hooks.shouldProcess && !hooks.shouldProcess(current)) {
    state.last = key; // remember so we don't re-evaluate the same value each tick
    return "skip";
  }

  const cleaned = await sanitizeFn(current);
  if (normalizeNewlines(cleaned) === key) {
    state.last = key; // already clean; don't rewrite
    return "already-clean";
  }

  if (hooks.dryRun?.()) {
    state.last = key; // report each new copy once, not every tick
    hooks.onResult?.("would-clean", current, cleaned);
    return "would-clean";
  }

  write(cleaned);
  state.last = normalizeNewlines(cleaned);
  state.lastOriginal = current;
  hooks.onResult?.("cleaned", current, cleaned);
  return "cleaned";
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface WatchFlags {
  quiet?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
  onlyMessy?: boolean;
}

interface WatchRuntime {
  options: SanitizeOptions;
  paused: boolean;
  skipNext: boolean;
  dryRun: boolean;
}

const onoff = (b: boolean): string => (b ? "on" : "off");
const persist = (key: string, val: boolean): string =>
  `(make it stick: socb config set ${key} ${val})`;

function modeLine(rt: WatchRuntime): string {
  const o = rt.options;
  const bits: string[] = [];
  if (rt.dryRun) bits.push("DRY-RUN");
  if (rt.paused) bits.push("PAUSED");
  bits.push(`Markdown ${onoff(o.markdown)}`, `tables ${o.tableMode}`, `redact ${onoff(o.redact)}`);
  return bits.join(" | ");
}

function bannerText(rt: WatchRuntime, intervalMs: number, quiet: boolean): string {
  if (quiet) {
    return `socb: watching clipboard (${modeLine(rt)}), every ${intervalMs}ms.\n`;
  }
  const tty = Boolean(process.stdin.isTTY);
  const lines = [
    "socb: watching your clipboard - copy anything and it's cleaned in place, ready to paste.",
    `      mode: ${modeLine(rt)}  (polling every ${intervalMs}ms)`,
    tty
      ? "      keys: [m] markdown  [r] redact  [p] pause  [s] skip next  [u] undo  [?] help  [q] quit"
      : "      (run this in a terminal to get live [m]/[r]/[p] controls)",
    `      paste into Slack / Teams / email / Jira. Press ${tty ? "q or " : ""}Ctrl+C to stop.`,
  ];
  return lines.join("\n") + "\n";
}

function firstRunText(): string {
  return (
    [
      "",
      "socb watch - first run. Here's what happens now:",
      "  - Every copy is cleaned in place on your clipboard, so you can paste straight",
      "    into Slack, Teams, email, or a Jira ticket - no screenshots, no code blocks.",
      "  - It flattens Markdown and strips terminal noise (ANSI, progress bars,",
      "    box-drawing tables, Nerd-Font glyphs) by default.",
      "  - It's reversible: press u to restore your last original copy, p to pause,",
      "    s to skip the next copy. Press q or Ctrl+C to stop.",
      "  - Only want it to touch terminal output (the old behavior)?  run --only-messy",
      "  - Want to watch it work without changing anything?           run --dry-run",
      "",
    ].join("\n") + "\n"
  );
}

function helpText(): string {
  return (
    [
      "socb watch keys:",
      "  m  toggle Markdown flattening",
      "  r  toggle secret / PII redaction",
      "  p  pause / resume",
      "  s  skip the next copy (paste one thing verbatim)",
      "  u  undo - restore your last original copy to the clipboard",
      "  ?  show this help        q  quit",
    ].join("\n") + "\n"
  );
}

/** Run the watch loop until the process is interrupted (Ctrl+C / q). */
export async function runWatch(
  options: SanitizeOptions,
  intervalMs: number,
  flags: WatchFlags = {},
): Promise<void> {
  const quiet = flags.quiet ?? false;
  const rt: WatchRuntime = {
    options: { ...options },
    paused: false,
    skipNext: false,
    dryRun: flags.dryRun ?? false,
  };
  const state: WatchState = { last: "", lastOriginal: null };

  const out = (s: string): void => {
    process.stderr.write(s);
  };
  const note = (s: string): void => {
    if (!quiet) out(`socb: ${s}\n`);
  };

  if (!quiet && isFirstWatchRun()) {
    out(firstRunText());
    markWatchRunSeen();
  }
  out(bannerText(rt, intervalMs, quiet));

  let stopKeys = (): void => {};
  const stop = (): void => {
    stopKeys();
    if (!quiet) out("\nsocb: stopped.\n");
    process.exit(0);
  };

  const doUndo = (): void => {
    if (state.lastOriginal == null) {
      note("nothing to undo yet");
      return;
    }
    try {
      writeClipboard(state.lastOriginal);
      state.last = normalizeNewlines(state.lastOriginal);
      state.lastOriginal = null;
      note("restored your original copy to the clipboard");
    } catch {
      note("couldn't restore the clipboard");
    }
  };

  stopKeys = startKeyListener({
    m: () => {
      rt.options.markdown = !rt.options.markdown;
      note(`Markdown flattening ${onoff(rt.options.markdown)} ${persist("markdown", rt.options.markdown)}`);
    },
    r: () => {
      rt.options.redact = !rt.options.redact;
      note(`redaction ${onoff(rt.options.redact)} ${persist("redact", rt.options.redact)}`);
    },
    p: () => {
      rt.paused = !rt.paused;
      note(rt.paused ? "paused - copies are left alone (press p to resume)" : "resumed");
    },
    s: () => {
      rt.skipNext = true;
      note("will leave your next copy untouched");
    },
    u: doUndo,
    "?": () => out(helpText()),
    h: () => out(helpText()),
    q: stop,
  });

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  const gate = flags.onlyMessy ? looksMessy : undefined;

  const report = (result: TickResult, raw: string, cleaned: string): void => {
    if (quiet) return;
    if (result === "cleaned" || result === "would-clean") {
      const d = detect(raw);
      const verb = result === "would-clean" ? "would clean" : "cleaned";
      let msg = `${verb} ${contentLabel(d)} - ${changeStats(raw, cleaned)}`;
      if (result === "would-clean") msg += " (dry-run: clipboard left as-is)";
      out(`socb: ${msg}\n`);
      if (d.html && !rt.options.html) out("      tip: looks like HTML - add --html to strip tags\n");
      if (d.secret && !rt.options.redact) out("      tip: possible secrets - press r to mask them\n");
    } else if (result === "already-clean" && flags.verbose) {
      out("socb: already clean - left as-is\n");
    }
  };

  for (;;) {
    try {
      await watchTick(
        readClipboard,
        writeClipboard,
        (s) => sanitize(s, rt.options),
        state,
        {
          shouldProcess: gate,
          paused: () => rt.paused,
          skipOnce: () => {
            if (rt.skipNext) {
              rt.skipNext = false;
              return true;
            }
            return false;
          },
          dryRun: () => rt.dryRun,
          onResult: report,
        },
      );
    } catch (e) {
      // One bad copy must never kill the watcher.
      if (!quiet) {
        out(`socb: couldn't process that copy - left unchanged (${e instanceof Error ? e.message : String(e)})\n`);
      }
    }
    await delay(intervalMs);
  }
}
