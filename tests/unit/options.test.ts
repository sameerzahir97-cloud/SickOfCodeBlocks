import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCli } from "../../src/options.js";

// Neutralize any real ~/.socbrc.json or ./.socbrc.json so the watch flip is
// deterministic: point HOME / USERPROFILE and cwd at empty temp dirs.
const saved = { home: process.env.HOME, up: process.env.USERPROFILE, cwd: process.cwd() };
const dirs: string[] = [];
function isolateConfig(): void {
  const home = mkdtempSync(join(tmpdir(), "socb-home-"));
  const work = mkdtempSync(join(tmpdir(), "socb-cwd-"));
  dirs.push(home, work);
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.chdir(work);
}

afterEach(() => {
  if (saved.home === undefined) delete process.env.HOME;
  else process.env.HOME = saved.home;
  if (saved.up === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = saved.up;
  process.chdir(saved.cwd);
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

describe("parseCli watch flip", () => {
  it("bare --watch flattens Markdown by default", () => {
    isolateConfig();
    const cli = parseCli(["--watch"]);
    expect(cli.watch).toBe(true);
    expect(cli.options.markdown).toBe(true);
    expect(cli.onlyMessy).toBe(false);
  });

  it("--watch --only-messy keeps Markdown off and arms the gate", () => {
    isolateConfig();
    const cli = parseCli(["--watch", "--only-messy"]);
    expect(cli.options.markdown).toBe(false);
    expect(cli.onlyMessy).toBe(true);
  });

  it("--watch --no-markdown stays literal", () => {
    isolateConfig();
    expect(parseCli(["--watch", "--no-markdown"]).options.markdown).toBe(false);
  });

  it("does not flip outside watch mode", () => {
    isolateConfig();
    expect(parseCli([]).options.markdown).toBe(false);
    expect(parseCli(["--clip"]).options.markdown).toBe(false);
  });

  it("a preset still decides Markdown under --watch", () => {
    isolateConfig();
    expect(parseCli(["--watch", "--agent"]).options.markdown).toBe(false); // agent keeps structure
    expect(parseCli(["--watch", "--email"]).options.markdown).toBe(true);
  });

  it("threads --dry-run and --verbose", () => {
    isolateConfig();
    const cli = parseCli(["--watch", "--dry-run", "--verbose"]);
    expect(cli.dryRun).toBe(true);
    expect(cli.verbose).toBe(true);
  });
});
