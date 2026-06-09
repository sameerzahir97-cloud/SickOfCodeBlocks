// MCP server: exposes socb's sanitizer as a tool any MCP client (Claude Desktop,
// Claude Code, Codex, ...) can call. Runs over stdio. The @modelcontextprotocol
// /sdk is an OPTIONAL dependency, so the default CLI path stays dependency-free;
// this entry only loads it when you actually run `socb-mcp`.
//
// tsup prepends the #!/usr/bin/env node shebang. The server is started only when
// this file is run directly (see the bottom guard), so importing sanitizeForTool
// in tests does not block on stdio.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { sanitize, type SanitizeOptions } from "./pipeline.js";
import { presetPatch, type Preset } from "./presets.js";
import { getVersion } from "./options.js";
import { readClipboard, writeClipboard } from "./io/clipboard.js";
import { summarizeChange } from "./io/summary.js";

const PRESETS: readonly Preset[] = ["slack", "teams", "email", "plain", "agent"];

export interface SanitizeToolArgs {
  text: string;
  preset?: Preset;
  options?: Partial<SanitizeOptions>;
}

/** Core of the sanitize_text tool: resolve preset + overrides, then sanitize. */
export async function sanitizeForTool(args: SanitizeToolArgs): Promise<string> {
  let opts: Partial<SanitizeOptions> = {};
  if (args.preset && PRESETS.includes(args.preset)) opts = presetPatch(args.preset);
  if (args.options && typeof args.options === "object") {
    opts = { ...opts, ...args.options };
  }
  return sanitize(args.text, opts);
}

const presetProp = {
  type: "string",
  enum: PRESETS as readonly string[],
  description:
    "Optional bundle. 'email'/'plain': flatten Markdown+HTML for a human reader. " +
    "'slack'/'teams': keep Unicode/tables for a chat app. 'agent': denoise but " +
    "keep Markdown + Unicode for a model.",
} as const;

const optionsProp = {
  type: "object",
  description:
    'Optional per-field overrides of SanitizeOptions, e.g. {"redact": true} or ' +
    '{"tableMode": "ascii"}. Applied on top of the preset.',
} as const;

const SANITIZE_TOOL = {
  name: "sanitize_text",
  description:
    "Clean messy terminal / Markdown / HTML / PowerShell output into plain, " +
    "human-readable text. Use it before quoting command output back to a user, " +
    "or when asked to make output paste-ready for email, Slack, or docs. It " +
    "strips ANSI codes, collapses progress bars/spinners, and removes box-drawing " +
    "and Nerd-Font glyph noise. With preset 'email' or 'plain' it also flattens " +
    "Markdown and HTML to prose; with 'agent' it denoises but keeps Markdown " +
    "structure (useful for re-ingesting tool output without burning tokens).",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "The raw text to sanitize." },
      preset: presetProp,
      options: optionsProp,
    },
    required: ["text"],
    additionalProperties: false,
  },
} as const;

const CLEAN_CLIPBOARD_TOOL = {
  name: "clean_clipboard",
  description:
    "Read the user's system clipboard, clean/flatten it, and write the result " +
    "back so they can paste plain text into Slack, Teams, email, or a Jira " +
    "ticket. Use when the user asks to tidy 'what I just copied' or their " +
    "clipboard, without setting up a persistent watcher. Returns a short summary " +
    "plus the cleaned text.",
  inputSchema: {
    type: "object",
    properties: { preset: presetProp, options: optionsProp },
    additionalProperties: false,
  },
} as const;

const START_WATCHER_TOOL = {
  name: "start_clipboard_watcher",
  description:
    "Open a terminal running `socb --watch` so EVERY copy the user makes is " +
    "auto-cleaned and paste-ready (Slack/Teams/email/Jira) until they stop it. " +
    "Best-effort: it attempts to open a new OS terminal window; if it can't, it " +
    "returns the exact command for you to run in a background terminal instead. " +
    "Offer this when the user wants ongoing, hands-off cleaning rather than a " +
    "one-off.",
  inputSchema: {
    type: "object",
    properties: {
      preset: presetProp,
      redact: { type: "boolean", description: "Also mask secrets/PII on every copy." },
      interval: {
        type: "number",
        description: "Poll interval in ms (default 800; 1500 on Windows).",
      },
    },
    additionalProperties: false,
  },
} as const;

const TOOLS = [SANITIZE_TOOL, CLEAN_CLIPBOARD_TOOL, START_WATCHER_TOOL];

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };
const textResult = (text: string): ToolResult => ({ content: [{ type: "text", text }] });
const errorResult = (text: string): ToolResult => ({ isError: true, content: [{ type: "text", text }] });

/** Pull the optional preset/options shared by sanitize_text and clean_clipboard. */
function readPresetArgs(a: Record<string, unknown>): {
  preset?: Preset;
  options?: Partial<SanitizeOptions>;
} {
  const out: { preset?: Preset; options?: Partial<SanitizeOptions> } = {};
  if (typeof a.preset === "string") out.preset = a.preset as Preset;
  if (a.options && typeof a.options === "object") out.options = a.options as Partial<SanitizeOptions>;
  return out;
}

async function callSanitize(a: Record<string, unknown>): Promise<ToolResult> {
  if (typeof a.text !== "string") return errorResult("missing required string argument: text");
  const args: SanitizeToolArgs = { text: a.text, ...readPresetArgs(a) };
  return textResult(await sanitizeForTool(args));
}

async function callCleanClipboard(a: Record<string, unknown>): Promise<ToolResult> {
  let raw: string;
  try {
    raw = readClipboard();
  } catch (e) {
    return errorResult(`couldn't read the clipboard: ${e instanceof Error ? e.message : String(e)}`);
  }
  const clean = await sanitizeForTool({ text: raw, ...readPresetArgs(a) });
  if (clean === raw) return textResult("Clipboard was already clean; left it as-is.");
  try {
    writeClipboard(clean);
  } catch (e) {
    return errorResult(
      `cleaned the text but couldn't write the clipboard: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return textResult(`Cleaned the clipboard (${summarizeChange(raw, clean)}). Ready to paste:\n\n${clean}`);
}

function buildWatchCommand(a: Record<string, unknown>): string {
  const parts = ["socb", "--watch"];
  if (typeof a.preset === "string" && (PRESETS as readonly string[]).includes(a.preset)) {
    parts.push(`--${a.preset}`);
  }
  if (a.redact === true) parts.push("--redact");
  if (typeof a.interval === "number" && Number.isInteger(a.interval) && a.interval > 0) {
    parts.push("--interval", String(a.interval));
  }
  return parts.join(" ");
}

/** Best-effort: spawn detached so the watcher outlives this server. */
function spawnDetached(bin: string, args: string[]): boolean {
  try {
    const child = spawn(bin, args, { detached: true, stdio: "ignore" });
    child.on("error", () => {}); // swallow ENOENT etc; this is best-effort
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function tryOpenTerminal(cmd: string): boolean {
  if (process.platform === "win32") {
    return spawnDetached("cmd", ["/c", "start", "socb watch", "cmd", "/k", cmd]);
  }
  if (process.platform === "darwin") {
    return spawnDetached("osascript", ["-e", `tell application "Terminal" to do script "${cmd}"`]);
  }
  const run = `${cmd}; exec bash`;
  const candidates: Array<[string, string[]]> = [];
  if (process.env.TERMINAL) candidates.push([process.env.TERMINAL, ["-e", "bash", "-lc", run]]);
  candidates.push(["x-terminal-emulator", ["-e", "bash", "-lc", run]]);
  candidates.push(["gnome-terminal", ["--", "bash", "-lc", run]]);
  candidates.push(["konsole", ["-e", "bash", "-lc", run]]);
  candidates.push(["xterm", ["-e", "bash", "-lc", run]]);
  return candidates.some(([bin, args]) => spawnDetached(bin, args));
}

function callStartWatcher(a: Record<string, unknown>): ToolResult {
  const cmd = buildWatchCommand(a);
  const opened = tryOpenTerminal(cmd);
  const lead = opened
    ? `Tried to open a new terminal running:\n\n    ${cmd}\n\nIf no window appeared,`
    : `Couldn't open a terminal from here. To start the watcher,`;
  return textResult(
    `${lead} run that command in a separate or background terminal yourself. ` +
      `Every copy is then cleaned in place and paste-ready for Slack/Teams/email/Jira. ` +
      `Press q or Ctrl+C in that window to stop it.`,
  );
}

function buildServer(): Server {
  const server = new Server(
    { name: "socb", version: getVersion() },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const a = (req.params.arguments ?? {}) as Record<string, unknown>;
    switch (req.params.name) {
      case SANITIZE_TOOL.name:
        return callSanitize(a);
      case CLEAN_CLIPBOARD_TOOL.name:
        return callCleanClipboard(a);
      case START_WATCHER_TOOL.name:
        return callStartWatcher(a);
      default:
        return errorResult(`unknown tool: ${req.params.name}`);
    }
  });

  return server;
}

async function main(): Promise<void> {
  const server = buildServer();
  await server.connect(new StdioServerTransport());
}

// Start the server only when run directly (not when imported by a test).
function isDirectRun(): boolean {
  try {
    return (
      typeof process.argv[1] === "string" &&
      realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main().catch((e: unknown) => {
    process.stderr.write(`socb-mcp error: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  });
}
