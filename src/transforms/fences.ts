// Strip code-block delimiter lines so a paste lands as plain text with no
// fences. Two kinds of marker lines are removed (the wrapped code/text between
// them is kept untouched):
//
//   * Markdown code fences — a line of 3+ backticks or 3+ tildes (the CommonMark
//     fence), optionally indented up to 3 spaces and carrying an info string
//     (e.g. ```bash). Both the opening and the closing fence are removed.
//   * PowerShell error underlines — the run of "~" PowerShell prints under the
//     offending token in a parse/binding error, usually behind the "+" gutter
//     (e.g. "    + ~~~~~~~~").
//
// Both render as noise once the text leaves a code block, which is exactly what
// makes a paste look like a screenshot-of-a-terminal. We drop the whole marker
// line (and its newline) rather than blanking it, so no stray empty line is left.

// Up to 3 spaces of indent, then >=3 backticks or >=3 tildes, then any info string.
const MD_FENCE = /^ {0,3}(?:`{3,}|~{3,}).*$/;
// PowerShell underline: optional indent, then either the "+" gutter followed by
// a tilde run, or a bare run of 2+ tildes. Requiring the gutter-or-2 guards a
// lone literal "~" on its own line from being swallowed.
const PS_UNDERLINE = /^\s*(?:\+[ \t]*~[~ \t]*|~~[~ \t]*)$/;

/** Remove Markdown code-fence lines and PowerShell tilde-underline lines. */
export function stripFences(input: string): string {
  // Fast path: no fence/underline characters anywhere.
  if (input.indexOf("`") === -1 && input.indexOf("~") === -1) return input;
  return input
    .split("\n")
    .filter((line) => !MD_FENCE.test(line) && !PS_UNDERLINE.test(line))
    .join("\n");
}
