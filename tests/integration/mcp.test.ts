import { describe, it, expect, beforeAll } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

// @modelcontextprotocol/sdk is an optional dependency; skip gracefully if absent.
let available = true;
let Client: any;
let StdioClientTransport: any;
try {
  ({ Client } = await import("@modelcontextprotocol/sdk/client/index.js"));
  ({ StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js"));
} catch {
  available = false;
}

const here = dirname(fileURLToPath(import.meta.url));
const MCP = resolve(here, "../../dist/mcp.js");

async function withClient(fn: (client: any) => Promise<void>): Promise<void> {
  const transport = new StdioClientTransport({ command: process.execPath, args: [MCP] });
  const client = new Client({ name: "socb-test", version: "0.0.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    await fn(client);
  } finally {
    await client.close();
  }
}

const textOf = (res: any): string =>
  (res.content as Array<{ text?: string }>).map((c) => c.text ?? "").join("");

describe.skipIf(!available)("mcp server (spawns dist/mcp.js)", () => {
  beforeAll(() => {
    if (!existsSync(MCP)) {
      throw new Error("dist/mcp.js missing — run `npm run build` (npm test does this).");
    }
  });

  it("advertises its tools", async () => {
    await withClient(async (client) => {
      const { tools } = await client.listTools();
      const names = tools.map((t: any) => t.name);
      expect(names).toContain("sanitize_text");
      expect(names).toContain("clean_clipboard");
      expect(names).toContain("start_clipboard_watcher");
    });
  });

  it("flattens Markdown via the email preset", async () => {
    await withClient(async (client) => {
      const res = await client.callTool({
        name: "sanitize_text",
        arguments: { text: "# Hi\n\n**bold**", preset: "email" },
      });
      expect(textOf(res)).toBe("Hi\n\nbold");
    });
  });

  it("applies per-field option overrides (redact)", async () => {
    await withClient(async (client) => {
      const res = await client.callTool({
        name: "sanitize_text",
        arguments: { text: "key AKIAIOSFODNN7EXAMPLE end", options: { redact: true } },
      });
      expect(textOf(res)).toContain("[REDACTED:aws-key]");
    });
  });
});
