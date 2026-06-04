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
import { sanitize, type SanitizeOptions } from "./pipeline.js";
import { presetPatch, type Preset } from "./presets.js";
import { getVersion } from "./options.js";

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

const TOOL = {
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
      preset: {
        type: "string",
        enum: PRESETS as readonly string[],
        description:
          "Optional bundle. 'email'/'plain': flatten Markdown+HTML for a human " +
          "reader. 'slack'/'teams': keep Unicode/tables for a chat app. 'agent': " +
          "denoise but keep Markdown + Unicode for a model.",
      },
      options: {
        type: "object",
        description:
          'Optional per-field overrides of SanitizeOptions, e.g. {"redact": true} ' +
          'or {"tableMode": "ascii"}. Applied on top of the preset.',
      },
    },
    required: ["text"],
    additionalProperties: false,
  },
} as const;

function buildServer(): Server {
  const server = new Server(
    { name: "socb", version: getVersion() },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [TOOL] }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name !== TOOL.name) {
      return {
        isError: true,
        content: [{ type: "text", text: `unknown tool: ${req.params.name}` }],
      };
    }
    const a = (req.params.arguments ?? {}) as Record<string, unknown>;
    if (typeof a.text !== "string") {
      return {
        isError: true,
        content: [{ type: "text", text: "missing required string argument: text" }],
      };
    }
    const args: SanitizeToolArgs = { text: a.text };
    if (typeof a.preset === "string") args.preset = a.preset as Preset;
    if (a.options && typeof a.options === "object") {
      args.options = a.options as Partial<SanitizeOptions>;
    }
    const clean = await sanitizeForTool(args);
    return { content: [{ type: "text", text: clean }] };
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
