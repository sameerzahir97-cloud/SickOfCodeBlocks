// Executable entry point. (tsup prepends the #!/usr/bin/env node shebang.)
//
// Exit codes: 0 ok | 1 unexpected error | 2 usage / no input / file not found
//             3 --emulate dependency missing | 4 clipboard unavailable

import { readFileSync, writeFileSync } from "node:fs";
import {
  parseCli,
  getVersion,
  HELP_TEXT,
  UsageError,
  type ParsedCli,
} from "./options.js";
import { isPipedStdin, readStdin } from "./io/stdin.js";
import { decodeInput } from "./io/decode.js";
import { summarizeChange } from "./io/summary.js";
import { readClipboard, writeClipboard, ClipboardError } from "./io/clipboard.js";
import { sanitize, shouldSuggestEmulate } from "./pipeline.js";
import { EmulateUnavailableError } from "./transforms/emulate.js";
import { runWatch } from "./watch.js";
import { setUserConfig, validate } from "./config.js";

function fail(message: string): void {
  process.stderr.write(`error: ${message}\n`);
}

const CONFIG_USAGE =
  "usage: socb config set <key> <value>   e.g. socb config set markdown false";

/** Coerce a CLI string into the boolean / number / string a config key expects. */
function coerceConfigValue(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  const n = Number(raw);
  if (raw.trim() !== "" && Number.isInteger(n)) return n;
  return raw;
}

/** `socb config set <key> <value>` — persist a default into ~/.socbrc.json. */
function handleConfig(args: string[]): number {
  if (args[0] !== "set" || args.length < 3) {
    fail(CONFIG_USAGE);
    return 2;
  }
  const key = args[1] as string;
  const value = coerceConfigValue(args[2] as string);
  // validate() keeps only known keys with the right type; if our key survived,
  // it's a real, well-typed setting.
  if (!(key in validate({ [key]: value }))) {
    fail(`unknown or invalid config setting: ${key}=${args[2]} (see socb --help)`);
    return 2;
  }
  try {
    const path = setUserConfig(key, value);
    process.stdout.write(`socb: set ${key} = ${JSON.stringify(value)} in ${path}\n`);
    return 0;
  } catch (e) {
    fail(`couldn't write config: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

async function loadInput(cli: ParsedCli): Promise<string> {
  if (cli.source.kind === "file") {
    return decodeInput(readFileSync(cli.source.path));
  }
  if (cli.source.kind === "clip") {
    return readClipboard();
  }
  // stdin
  if (!isPipedStdin()) {
    throw new UsageError(
      "no input. Pipe data in, pass a file, or use --clip. (socb --help)",
    );
  }
  return readStdin();
}

async function main(argv: string[]): Promise<number> {
  if (argv[0] === "config") return handleConfig(argv.slice(1));

  let cli: ParsedCli;
  try {
    cli = parseCli(argv);
  } catch (e) {
    if (e instanceof UsageError) {
      fail(e.message);
      return 2;
    }
    throw e;
  }

  if (cli.showHelp) {
    process.stdout.write(HELP_TEXT);
    return 0;
  }
  if (cli.showVersion) {
    process.stdout.write(getVersion() + "\n");
    return 0;
  }

  if (cli.watch) {
    // Runs until interrupted (Ctrl+C); runWatch calls process.exit on signal.
    try {
      await runWatch(cli.options, cli.interval, {
        quiet: cli.quiet,
        verbose: cli.verbose,
        dryRun: cli.dryRun,
        onlyMessy: cli.onlyMessy,
      });
    } catch (e) {
      if (e instanceof ClipboardError) {
        fail(e.message);
        return 4;
      }
      if (e instanceof EmulateUnavailableError) {
        fail(e.message);
        return 3;
      }
      throw e;
    }
    return 0;
  }

  let raw: string;
  try {
    raw = await loadInput(cli);
  } catch (e) {
    if (e instanceof UsageError) {
      fail(e.message);
      return 2;
    }
    if (e instanceof ClipboardError) {
      fail(e.message);
      return 4;
    }
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") {
      fail(`file not found: ${(cli.source as { path?: string }).path ?? ""}`);
      return 2;
    }
    throw e;
  }

  if (!cli.options.emulate && shouldSuggestEmulate(raw)) {
    process.stderr.write(
      "hint: input contains cursor movement; consider --emulate for accurate output.\n",
    );
  }

  let out: string;
  try {
    out = await sanitize(raw, cli.options);
  } catch (e) {
    if (e instanceof EmulateUnavailableError) {
      fail(e.message);
      return 3;
    }
    throw e;
  }

  const withNewline = out.length > 0 ? out + "\n" : out;
  let wrote = false;
  if (cli.outFile) {
    writeFileSync(cli.outFile, withNewline);
    wrote = true;
  }
  if (cli.toClipboard) {
    try {
      writeClipboard(out); // no trailing newline on the clipboard
    } catch (e) {
      if (e instanceof ClipboardError) {
        fail(e.message);
        return 4;
      }
      throw e;
    }
    // The cleaned text went to the clipboard, so without this the user has no
    // feedback that anything happened.
    if (!cli.quiet) process.stderr.write(`socb: ${summarizeChange(raw, out)}\n`);
    wrote = true;
  }
  if (!wrote) process.stdout.write(withNewline);
  return 0;
}

// Guard against EPIPE when piping into a reader that closes early (e.g. `socb | head`).
process.stdout.on("error", (e: NodeJS.ErrnoException) => {
  if (e.code === "EPIPE") process.exit(0);
});

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e: unknown) => {
    fail(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  });
