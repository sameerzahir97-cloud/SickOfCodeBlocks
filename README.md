# SickOfCodeBlocks (`socb`)

> Paste terminal output into email, Slack, and docs as clean text — no screenshots, no triple-backtick code blocks.

Raw terminal output is full of stuff that turns to garbage the moment it leaves the terminal: ANSI color codes, progress bars that redrew themselves 200 times, spinner frames, Nerd Font icons that show up as `□`, and box-drawing tables that fall apart in a proportional font. `socb` cleans all of it and gives you plain, readable text.

Stripping colors is the easy 10%. `socb` also does the parts other tools skip:

- **Collapses progress bars & spinners** to their final state (resolves carriage-return / backspace / erase-line redraws).
- **Flattens multi-line redraws** (docker / cargo / pip) with an optional headless-terminal mode (`--emulate`).
- **Removes Nerd Font / Powerline glyphs** (Private Use Area) that render as tofu.
- **Rebuilds box-drawing tables** into clean aligned columns.
- **Strips embedded escape strings** that `strip-ansi` leaks — OSC, plus DCS/APC (sixel, Kitty graphics).
- **Rewrites hyperlinks** (`OSC 8`) to `text (url)` instead of dropping the URL.
- **Normalizes** smart quotes/dashes/ellipses to ASCII and tidies whitespace.
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

### Before / after

Raw (what your terminal received):

```
\e[2K\rDownloading [####------] 40%\e[2K\rDownloading [##########] 100%
\e[32m✔\e[0m  build succeeded
 master \e]8;;https://ci.example.com/42\aview run\e]8;;\a
```

After `socb`:

```
Downloading [##########] 100%
✔  build succeeded
master view run (https://ci.example.com/42)
```

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
| `--no-typographic` | | Keep smart quotes / em-dashes / ellipsis (don't convert to ASCII) |
| `--arrows` | | Also convert arrows (`→` becomes `->`) |
| `--expand-tabs` / `--tab-width <n>` | | Convert tabs to spaces (default width 4) |
| `--crlf` | | Emit CRLF line endings (default LF) |
| `--no-collapse-blanks` | | Keep runs of blank lines |
| `--redact` | `-r` | Mask API keys, JWTs, emails, IPs, and home-dir paths |
| `--watch` | `-w` | Keep cleaning the clipboard in place (Ctrl+C to stop) |
| `--interval <ms>` | | `--watch` poll interval (default 800) |
| `--slack` / `--email` / `--plain` | | Presets (below) |
| `--help` / `--version` | `-h` / `-v` | |

### Presets

Presets set a bundle of defaults; any explicit flag still overrides them.

| Preset | Tables | Emoji | Typography | Notes |
|---|---|---|---|---|
| `--slack` | reconstruct | keep | → ASCII | Slack renders Unicode; aligned tables read well |
| `--email` | strip | strip | → ASCII | Proportional fonts can't align columns |
| `--plain` | strip | strip | → ASCII | Maximum compatibility; arrows + tabs→spaces too |

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

## Use as a library

```ts
import { sanitize } from "sickofcodeblocks";

const clean = await sanitize(rawTerminalOutput, { tableMode: "strip", redact: true });
```

Individual transforms (`stripEscapes`, `resolveOverwrites`, `transformTables`, `redact`, …) are exported too.

## License

MIT
