# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.1] - 2026-06-04

### Added
- `--teams` preset for Microsoft Teams — same bundle as `--slack` (both are
  proportional-font chat apps that render Unicode/emoji and have a monospace code
  block, so tables reconstruct and Markdown is left intact). Also accepted by the
  MCP `sanitize_text` tool.

### Changed
- Clearer README: lead with a before/after example and a condensed feature list.

## [0.2.0] - 2026-06-04

### Added
- **Markdown flattening** (`--markdown` / `-m`; on in `--email` / `--plain`):
  drops headings, `**bold**`/`*italic*`/`~~strike~~`, inline `` `code` `` and list
  markers, rewrites `[text](url)` → `text (url)`, and unwraps autolinks/images.
  Fenced and inline code are kept **verbatim** — shielded from inline stripping
  and typography via a sentinel pass. New `flattenMarkdown` transform.
- **HTML → text** (`--html`): strip tags, drop script/style, decode entities.
- **PowerShell cleanup** (`--powershell` / `--ps`): drop `~~~~` underlines and the
  `+ ` continuation gutter from pasted error records (block-anchored so diffs are
  safe). New `cleanPowerShell` transform.
- **Shell-prompt stripping** (`--prompts`): `$ `, `PS C:\>`, `>>>`, `user@host:…$`.
- **Paragraph reflow** (`--reflow`): rejoin hard-wrapped prose for proportional
  fonts (conservative; under-joins rather than over-joins).
- **`--agent` preset**: denoise for feeding output *into* a model — strip
  ANSI/box/glyph noise but keep Markdown structure and Unicode.
- **Clipboard feedback**: `socb --clip` prints a one-line change summary on stderr
  (lines/bytes/escape-sequences); `-q` / `--quiet` silences it.
- **Safer `--watch`**: a plain `socb --watch` only rewrites copies that look like
  terminal output (so it can be left running without touching ordinary text);
  `--markdown`/`--html` opt back into transforming every copy. Slower default poll
  on Windows (1500 ms) to cut the PowerShell-spawn cost.
- `--email` / `--plain` presets flatten Markdown but keep `--html`, `--prompts`,
  `--reflow`, and `--powershell` **opt-in** — they can alter ordinary prose
  (`<generics>`, a leading `$`, hard-wrapped paragraphs), so they aren't bundled.
- **UTF-16 / BOM input decoding**: Windows files and clipboard exports no longer
  mojibake. New `decodeInput` helper.
- **MCP server** (`socb-mcp`): exposes `sanitize_text` to Claude Desktop / Claude
  Code / Codex. `@modelcontextprotocol/sdk` is an optional dependency.
- **Experimental PreToolUse hook** (`hooks/socb-clean.mjs`) that pipes noisy Bash
  output through `socb --agent` before it reaches the model's context.
- Markdown pipe tables with GitHub alignment delimiters (`| :--: |`) are now
  recognized by the table engine.
- Strip Markdown code fences (```` ``` ````/`~~~`) and PowerShell `~~~~~` error
  underlines so pasted output is fence-free (on by default; `--no-fences` to
  keep them). New `stripFences` option / exported transform.

## [0.1.1] - 2026-06-02

### Added
- Initial release: `sickofcodeblocks` / `socb` CLI.
- Core pipeline: OSC 8 hyperlink rewrite, carriage-return/spinner collapse,
  augmented ANSI/OSC/DCS/APC escape stripping, Nerd Font/Powerline glyph
  removal, box-drawing table reconstruction, smart-punctuation → ASCII,
  whitespace normalization.
- `--emulate` headless-terminal mode for multi-line redraws.
- `--redact` secret/PII masking.
- `--slack` / `--email` / `--plain` presets.
- `--clip` clipboard input/output.
- `--watch` clipboard-watch mode: clean every copy in place automatically.
- Config file (`~/.socbrc.json` / `./.socbrc.json`) for persistent default options.
