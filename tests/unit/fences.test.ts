import { describe, it, expect } from "vitest";
import { stripFences } from "../../src/transforms/fences.js";

describe("stripFences", () => {
  it("removes opening and closing backtick fences, keeps the code", () => {
    const input = "```bash\nnpm install\n```";
    expect(stripFences(input)).toBe("npm install");
  });

  it("removes tilde fences (CommonMark ~~~)", () => {
    expect(stripFences("~~~\ncode\n~~~")).toBe("code");
  });

  it("removes indented fences (up to 3 spaces) with an info string", () => {
    expect(stripFences("   ```js\nx\n   ```")).toBe("x");
  });

  it("removes PowerShell tilde underlines with the + gutter", () => {
    const input = "At line:1 char:1\n+ Get-Foo\n+ ~~~~~~~";
    expect(stripFences(input)).toBe("At line:1 char:1\n+ Get-Foo");
  });

  it("removes indented PowerShell underlines", () => {
    expect(stripFences("    + ~~~~~~~~")).toBe("");
  });

  it("removes a bare run of tildes", () => {
    expect(stripFences("token\n~~~~~~")).toBe("token");
  });

  it("keeps a lone literal tilde line", () => {
    expect(stripFences("~")).toBe("~");
  });

  it("keeps inline backticks and tildes in prose", () => {
    expect(stripFences("use `npm` in ~/projects")).toBe("use `npm` in ~/projects");
  });

  it("leaves fence-free text untouched (fast path)", () => {
    expect(stripFences("hello world")).toBe("hello world");
  });
});
