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
import { readClipboard, writeClipboard, ClipboardError } from "./io/clipboard.js";
import { sanitize, shouldSuggestEmulate } from "./pipeline.js";
import { EmulateUnavailableError } from "./transforms/emulate.js";
import { runWatch } from "./watch.js";

function fail(message: string): void {
  process.stderr.write(`error: ${message}\n`);
}

async function loadInput(cli: ParsedCli): Promise<string> {
  if (cli.source.kind === "file") {
    return readFileSync(cli.source.path, "utf8");
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
      await runWatch(cli.options, cli.interval);
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
