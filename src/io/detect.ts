// Lightweight, heuristic content classification used ONLY for human-facing watch
// feedback: what kind of copy did we just clean, and which control is relevant.
// It NEVER decides the transform pipeline (that's options-driven). Unicode ranges
// are written as "\\u...." strings so this source file stays pure ASCII.

const ESC = String.fromCharCode(27);
const CONTROL = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]");
const BOX = new RegExp("[\\u2500-\\u257F]"); // box-drawing block
const GLYPH = new RegExp("[\\uE000-\\uF8FF]"); // Nerd Font / Private Use Area
const CR_REDRAW = new RegExp("\\r(?!\\n|$)"); // mid-line carriage return = progress redraw
const MARKDOWN = /[`*_#>[\]~]|^[ \t]*(?:[-+]\s|\d{1,9}[.)]\s)/m;
const HTML = /<\/?[a-zA-Z][^>]*>|&(?:[a-zA-Z]{2,}|#\d+);/;
const PIPE_TABLE = /^[^\n|]*\|[^\n|]*\|/m;
// Cheap "looks like a secret" sniff that drives the redact nudge. redact.ts is the
// real, thorough masker; this is only a hint.
const SECRET =
  /sk-[A-Za-z0-9]{16}|ghp_[A-Za-z0-9]{16}|AKIA[0-9A-Z]{12}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{12}/;

export interface Detected {
  terminal: boolean; // ANSI / C0 control / box-drawing / glyph / progress redraw
  markdown: boolean;
  html: boolean;
  table: boolean;
  secret: boolean;
}

/** Classify a raw clipboard copy for feedback purposes (heuristic, best-effort). */
export function detect(s: string): Detected {
  const terminal =
    s.indexOf(ESC) !== -1 ||
    CONTROL.test(s) ||
    BOX.test(s) ||
    GLYPH.test(s) ||
    CR_REDRAW.test(s);
  return {
    terminal,
    markdown: MARKDOWN.test(s),
    html: HTML.test(s),
    table: BOX.test(s) || PIPE_TABLE.test(s),
    secret: SECRET.test(s),
  };
}

/** A short human label for the dominant content kind. */
export function contentLabel(d: Detected): string {
  if (d.terminal) return "terminal output";
  if (d.html) return "HTML";
  if (d.markdown) return "Markdown";
  if (d.table) return "a table";
  return "text";
}
