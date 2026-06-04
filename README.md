# SickOfCodeBlocks (`socb`)

[![npm version](https://img.shields.io/npm/v/sickofcodeblocks.svg)](https://www.npmjs.com/package/sickofcodeblocks)
[![CI](https://github.com/sameerzahir97-cloud/SickOfCodeBlocks/actions/workflows/ci.yml/badge.svg)](https://github.com/sameerzahir97-cloud/SickOfCodeBlocks/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/npm/l/sickofcodeblocks.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/sickofcodeblocks.svg)](https://nodejs.org)

> Paste terminal output — and Markdown / AI answers — into email, Slack, and docs as clean text. No screenshots, no triple-backtick code blocks.

What your terminal emits:

```
\e[2K\rDownloading [####------] 40%\e[2K\rDownloading [##########] 100%
\e[32m✔\e[0m  build succeeded
 master \e]8;;https://ci.example.com/42\aview run\e]8;;\a
```

What `some-command | socb` gives you:

```
Downloading [##########] 100%
✔  build succeeded
master view run (https://ci.example.com/42)
```

**▶ [Try it live in your browser](https://sameerzahir97-cloud.github.io/SickOfCodeBlocks/)** — paste your own terminal, Salesforce CLI, or AI output and watch it clean up. Runs 100% client-side; nothing you paste leaves your machine.

Raw terminal output is full of stuff that turns to garbage the moment it leaves the terminal: ANSI color codes, progress bars that redrew themselves 200 times, spinner frames, Nerd Font icons that show up as `□`, and box-drawing tables that fall apart in a proportional font. `socb` cleans all of it and gives you plain, readable text.

Stripping colors is the easy 10%. `socb` also does the parts other tools skip:

- **Collapses progress bars & spinners** to their final frame (CR / backspace / erase-line redraws), and flattens multi-line redraws like docker/cargo/pip with `--emulate`.
- **Flattens Markdown & HTML to readable prose** — `#` headings, `**bold**`, inline `` `code` ``, lists, `[text](url)` → `text (url)` — while keeping fenced code **verbatim**. Opt-in (`--email` / `--plain`, `-m`, `--html`).
- **Rebuilds box-drawing & Markdown tables** into clean aligned columns, and **drops Nerd Font / Powerline glyphs** that render as tofu.
- **Strips every escape sequence** `strip-ansi` leaks (OSC, DCS/APC, sixel/Kitty) and **rewrites OSC 8 hyperlinks** to `text (url)` instead of dropping the URL.
- **Tidies PowerShell errors & shell prompts, reflows hard wraps, normalizes** smart quotes/dashes to ASCII, and **decodes UTF-16 / BOM** input (no Windows mojibake).
- **Optionally redacts** secrets/PII before you share output up the chain (`--redact`).

Zero runtime dependencies on the default path. Works on Windows, macOS, and Linux.

## Install

```sh
npm install -g sickofcodeblocks      # commands: sickofcodeblocks  and  socb
# or run without installing:
npx sickofcodeblocks --help
```

`--emulate` needs one optional package:

```sh
npm install -g @xterm/headless
```

## Quick start

```sh
some-command | socb                  # clean a pipe
some-command 2>&1 | socb             # include stderr
socb messy.log                       # clean a file
socb --clip                          # read clipboard, clean, write it back
socb --clip --redact                 # ...and mask secrets first
docker ps | socb --table ascii       # tables as +--+ instead of aligned columns
pytest 2>&1 | socb --plain > clean.txt
```

## Recipes

Real workflows, with the exact command:

| You want to… | Run |
|---|---|
| Share a failing build in Teams or Slack | `npm test 2>&1 \| socb --teams` |
| Tidy an `sf`/`sfdx` deploy error for Teams | `sf project deploy start 2>&1 \| socb --teams` |
| Email an AI answer or README as plain prose | copy it, then `socb --clip --email` |
| Clean a log file for a gist / bug report | `socb build.log --plain > clean.txt` |
| Auto-clean every copy (set & forget) | `socb --watch` |
| Scrub secrets before sharing | `socb --clip --redact` |
| Tidy a pasted terminal session (prompts + wraps) | `socb session.txt --email --prompts --reflow` |
| Tidy a PowerShell error block | `socb err.txt --ps` |
| Feed clean output to an LLM / agent | `some-cmd \| socb --agent` |

`--clip` reads the clipboard, cleans it, writes it back, and prints a one-line summary — then just paste. (`-q`/`--quiet` silences the summary.)

## Automate it (no per-copy command)

Don't want to run `socb` every time? Two ways to make it automatic:

**1. Watch the clipboard.** Run it once and every copy is cleaned in place:

```sh
socb --watch              # clean each copy
socb --watch --redact     # ...and mask secrets too
```

Copy any messy terminal output anywhere → it's sanitized the moment you copy it, ready to paste. Press Ctrl+C to stop. (Loop-safe: it never re-processes its own output.)

**2. Set persistent defaults** so you never type a flag. Drop a `~/.socbrc.json` (or a per-project `./.socbrc.json`):

```json
{ "redact": true, "tableMode": "strip" }
```

Precedence: built-in defaults < config file < preset < command-line flags. With `redact: true` in your config, even `socb --watch` redacts automatically.

**Start it on login (Windows).** To have the watcher always running, register it with Task Scheduler once:

```powershell
$action  = New-ScheduledTaskAction -Execute "socb" -Argument "--watch"
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "socb-watch" -Action $action -Trigger $trigger
```

(macOS: a `launchd` agent; Linux: a `systemd --user` service or your DE's autostart.)

## Options

```
socb [options] [file]
<command> | socb [options]
socb --clip [options]

Input priority:  [file] argument  >  --clip  >  piped stdin
```

| Flag | Short | Description |
|---|---|---|
| `--clip` | `-c` | Read from the clipboard and write the result back to it |
| `--out <file>` | `-o` | Write result to a file (default: stdout) |
| `--emulate` | `-e` | Replay through a headless terminal — for multi-line redraws & TUIs |
| `--cols <n>` / `--rows <n>` | | Emulator grid size (default 200 / 600) |
| `--table <mode>` | `-t` | `reconstruct` (default) · `ascii` · `strip` · `keep` |
| `--no-links` | | Don't rewrite OSC 8 hyperlinks |
| `--strip-emoji` | | Remove emoji (+ ZWJ / variation selectors / skin tones) |
| `--no-glyphs` | | Keep Nerd Font / Private-Use glyphs |
| `--no-fences` | | Keep Markdown code fences + PowerShell `~` underlines (default strips them) |
| `--markdown` | `-m` | Flatten Markdown to readable text (code kept verbatim); on in `--email` / `--plain` |
| `--no-markdown` | | Keep Markdown markup literal (the default) |
| `--html` | | Strip HTML tags and decode entities (`&amp;` → `&`) |
| `--prompts` | | Strip leading shell prompts (`$`, `PS C:\>`, `>>>`) |
| `--reflow` | | Rejoin hard-wrapped prose into flowing paragraphs |
| `--powershell` / `--ps` | | Tidy pasted PowerShell errors (`~` underlines + `+` gutter) |
| `--no-typographic` | | Keep smart quotes / em-dashes / ellipsis (don't convert to ASCII) |
| `--arrows` | | Also convert arrows (`→` becomes `->`) |
| `--expand-tabs` / `--tab-width <n>` | | Convert tabs to spaces (default width 4) |
| `--crlf` | | Emit CRLF line endings (default LF) |
| `--no-collapse-blanks` | | Keep runs of blank lines |
| `--redact` | `-r` | Mask API keys, JWTs, emails, IPs, and home-dir paths |
| `--watch` | `-w` | Keep cleaning the clipboard in place (Ctrl+C to stop) |
| `--interval <ms>` | | `--watch` poll interval (default 800; 1500 on Windows) |
| `--slack` / `--teams` / `--email` / `--plain` / `--agent` | | Presets (below) |
| `--help` / `--version` | `-h` / `-v` | |

### Presets

Presets set a bundle of defaults; any explicit flag still overrides them (e.g. `--email --no-markdown`).

| Preset | Tables | Markdown | Notes |
|---|---|---|---|
| `--slack` / `--teams` | reconstruct | left as-is | Slack & Teams render Unicode/emoji; paste tables inside a code block so columns align |
| `--email` | strip | **flattened** | Markdown → readable prose for proportional fonts (email / Docs / Word) |
| `--plain` | strip | **flattened** | The `--email` bundle + arrows + tabs→spaces. Maximum compatibility |
| `--agent` | strip | kept (structure) | Denoise for feeding output **into** a model: strips ANSI/box/glyph noise but keeps Markdown + Unicode (no flattening, no ASCII folding) |

`--html`, `--prompts`, `--reflow`, and `--powershell` are **not** bundled into the presets — each can alter ordinary prose (`<generics>`, a leading `$`, hard-wrapped paragraphs), so add them explicitly when your input needs them (e.g. `socb --email --reflow`).

## Markdown & rich paste

Pasting a Claude / ChatGPT answer (or a README) into email drags along `#`, `**`, backticks, and ` ``` ` fences. `--markdown` (`-m`, and on by default in `--email` / `--plain`) flattens it to plain prose while keeping fenced code **verbatim**:

Input:

````md
## Deploy
1. Run `npm ci`, then **build**.
2. See the [runbook](https://wiki/runbook).

```bash
export TOKEN=abc   # keep me exactly
```
````

`socb --email`:

```
Deploy
1. Run npm ci, then build.
2. See the runbook (https://wiki/runbook).

export TOKEN=abc   # keep me exactly
```

It's **opt-in**, so a bare `socb` never mangles raw terminal output (where `*`, `_`, `#`, backticks are literal). `--html` does the same for HTML copied from a browser, Slack, or Teams.

## Tables

By default `socb` rebuilds box-drawing tables (`docker ps`, `kubectl get`, `gh pr list`, …) into clean space-aligned columns. Aligned columns only line up in a **monospace** destination — for email / Google Docs / Word (proportional fonts) use `--table strip` or `--email`.

## Redaction

`--redact` is **best-effort, not a security guarantee** — always review the output before sharing. It masks AWS/GitHub/Slack/OpenAI keys, JWTs, `Bearer` tokens, `key=value` secrets, emails, IPv4 addresses (octet-validated), long hex tokens, and rewrites home-directory paths (`C:\Users\you`, `/home/you`) to `~`.

## Windows / PowerShell note

PowerShell decodes and re-encodes the stream when you pipe **between two native commands**, which can convert carriage returns and mangle UTF-8 *before* `socb` ever sees the bytes. ANSI color stripping still works, but progress-bar collapse may not. To get byte-faithful input on PowerShell, prefer a file or the clipboard:

```powershell
cmd /c "some-command > out.log 2>&1"   # cmd redirection keeps raw bytes
socb out.log
# or, after selecting & copying terminal output:
socb --clip
```

(`cmd.exe` and POSIX shells pipe bytes faithfully, so `some-command | socb` is fine there.)

## Use with AI agents (MCP + hook)

`socb` ships an MCP server so Claude Desktop, Claude Code, and Codex can clean text on demand, plus an experimental hook that denoises shell output before it reaches the model.

### MCP server

`socb-mcp` is a stdio MCP server exposing one tool, `sanitize_text(text, preset?, options?)`.

Claude Code / Claude Desktop — add to `.mcp.json` (project) or your user config:

```json
{ "mcpServers": { "socb": { "command": "socb-mcp" } } }
```

Codex — add to `~/.codex/config.toml`:

```toml
[mcp_servers.socb]
command = "socb-mcp"
```

(If `socb-mcp` isn't on `PATH`, use `npx -y sickofcodeblocks socb-mcp`.) The server needs the optional `@modelcontextprotocol/sdk` dependency, which installs by default with the package — the plain CLI path stays dependency-free.

### Auto-clean hook (experimental)

`hooks/socb-clean.mjs` is a Claude Code **PreToolUse** hook that rewrites noisy Bash commands (`npm`, `pip`, `cargo`, `docker`, `pytest`, …) to pipe their output through `socb --agent`, cutting ANSI / progress-bar tokens before they hit the model's context. It preserves the original exit code and falls back to raw output if `socb` is missing. Enable it in `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "node /abs/path/to/hooks/socb-clean.mjs" }]
      }
    ]
  }
}
```

It is conservative (only known-noisy tools; never multi-line / heredoc commands) and **experimental** — the MCP `sanitize_text` tool is the dependable path. On Windows it relies on the Bash tool running through git-bash (byte-faithful pipes); native PowerShell piping is not, so don't wire it to a PowerShell runner.

## Use as a library

```ts
import { sanitize } from "sickofcodeblocks";

const clean = await sanitize(rawTerminalOutput, { tableMode: "strip", markdown: true, redact: true });
```

Individual transforms (`stripEscapes`, `resolveOverwrites`, `transformTables`, `flattenMarkdown`, `htmlToText`, `cleanPowerShell`, `stripPrompts`, `reflowParagraphs`, `redact`, `decodeInput`, …) are exported too.

## License

MIT
