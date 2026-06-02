// Clipboard watch mode: run once and keep cleaning the clipboard in place, so
// users never have to invoke the tool per-copy. Copy messy output anywhere and
// it is sanitized (and optionally redacted) the next poll.

import { sanitize, type SanitizeOptions } from "./pipeline.js";
import { readClipboard, writeClipboard } from "./io/clipboard.js";

export interface WatchState {
  last: string;
}

export type TickResult = "skip" | "cleaned" | "already-clean";

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
): Promise<TickResult> {
  let current: string;
  try {
    current = read();
  } catch {
    return "skip"; // transient clipboard read failure; try again next tick
  }
  if (current === "" || current === state.last) return "skip";

  const cleaned = await sanitizeFn(current);
  if (cleaned === current) {
    state.last = current; // already clean; don't rewrite
    return "already-clean";
  }
  write(cleaned);
  state.last = cleaned;
  return "cleaned";
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Run the watch loop until the process is interrupted (Ctrl+C). */
export async function runWatch(
  options: SanitizeOptions,
  intervalMs: number,
): Promise<void> {
  const state: WatchState = { last: "" };
  process.stderr.write(
    `socb: watching clipboard${options.redact ? " (redacting)" : ""}, every ${intervalMs}ms. Press Ctrl+C to stop.\n`,
  );

  const stop = () => {
    process.stderr.write("\nsocb: stopped.\n");
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  for (;;) {
    const result = await watchTick(
      readClipboard,
      writeClipboard,
      (s) => sanitize(s, options),
      state,
    );
    if (result === "cleaned") process.stderr.write("socb: cleaned clipboard.\n");
    await delay(intervalMs);
  }
}
