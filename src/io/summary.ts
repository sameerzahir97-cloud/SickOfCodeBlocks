// A short, honest one-line summary of what sanitize changed — shown on stderr in
// clipboard / watch mode, where the cleaned text goes to the clipboard and the
// user would otherwise have no feedback at all. We only report things we actually
// measure (line + byte deltas, escape-sequence count), never guesses.

const ESC = String.fromCharCode(27); // ANSI/OSC introducer

function formatBytes(n: number): string {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

/** The measured deltas only ("5 -> 3 lines, 1.2 KB -> 0.9 KB, 2 escapes removed"). */
export function changeStats(raw: string, out: string): string {
  const parts: string[] = [];
  const rawLines = raw.split("\n").length;
  const outLines = out.split("\n").length;
  if (rawLines !== outLines) parts.push(`${rawLines} -> ${outLines} lines`);
  parts.push(`${formatBytes(Buffer.byteLength(raw))} -> ${formatBytes(Buffer.byteLength(out))}`);
  const escapes = raw.split(ESC).length - 1;
  if (escapes > 0) parts.push(`${escapes} escape sequence${escapes === 1 ? "" : "s"} removed`);
  return parts.join(", ");
}

/** One-line description of the change from `raw` to `out`. */
export function summarizeChange(raw: string, out: string): string {
  if (out === raw) return "already clean";
  return `cleaned: ${changeStats(raw, out)}`;
}
