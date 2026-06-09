// Live single-key controls for watch mode. Active only on a real interactive TTY;
// when stdin is piped/redirected (launched detached, under a scheduler, or in a
// test) this is a no-op and watch runs purely on flags.

import * as readline from "node:readline";

export type KeyHandlers = Record<string, () => void>;

/**
 * Start listening for single keypresses, dispatching to `handlers` by key name
 * (e.g. "m", "q") or raw string (e.g. "?"). Returns a stop() that detaches the
 * listener and restores the terminal. Safe to call when there is no TTY.
 */
export function startKeyListener(handlers: KeyHandlers): () => void {
  const stdin = process.stdin;
  if (!stdin.isTTY) return () => {};

  readline.emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();

  const onKeypress = (
    str: string | undefined,
    key: { name?: string; ctrl?: boolean } | undefined,
  ): void => {
    // Raw mode swallows the automatic SIGINT/EOF, so map Ctrl+C / Ctrl+D to quit.
    if (key && key.ctrl && (key.name === "c" || key.name === "d")) {
      handlers.q?.();
      return;
    }
    const byName = key?.name ? handlers[key.name] : undefined;
    const byStr = str ? handlers[str] : undefined;
    (byName ?? byStr)?.();
  };

  stdin.on("keypress", onKeypress);

  return () => {
    stdin.off("keypress", onKeypress);
    try {
      if (stdin.isTTY) stdin.setRawMode(false);
    } catch {
      /* ignore: terminal already restored / not a tty */
    }
    stdin.pause();
  };
}
