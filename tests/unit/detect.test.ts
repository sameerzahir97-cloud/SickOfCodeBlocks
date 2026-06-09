import { describe, it, expect } from "vitest";
import { detect, contentLabel } from "../../src/io/detect.js";

describe("detect", () => {
  it("flags terminal output (ANSI / control / box / progress redraw)", () => {
    expect(detect("\x1b[31mred\x1b[0m").terminal).toBe(true);
    expect(detect("a\rb").terminal).toBe(true); // mid-line carriage return
    expect(detect("plain prose, nothing special").terminal).toBe(false);
  });

  it("flags Markdown structure", () => {
    expect(detect("# Heading").markdown).toBe(true);
    expect(detect("- item\n- item").markdown).toBe(true);
    expect(detect("**bold**").markdown).toBe(true);
    expect(detect("just a normal sentence.").markdown).toBe(false);
  });

  it("flags HTML, but not stray angle brackets in prose", () => {
    expect(detect("<p>hi</p>").html).toBe(true);
    expect(detect("a &amp; b").html).toBe(true);
    expect(detect("if a < b and c > d then").html).toBe(false);
  });

  it("flags tables (pipe or box-drawing)", () => {
    expect(detect("| a | b |\n| 1 | 2 |").table).toBe(true);
    expect(detect("nothing tabular here").table).toBe(false);
  });

  it("flags likely secrets", () => {
    expect(detect("token ghp_0123456789abcdefABCD here").secret).toBe(true);
    expect(detect("nothing secret in here").secret).toBe(false);
  });

  it("labels the dominant content kind", () => {
    expect(contentLabel(detect("\x1b[31mred\x1b[0m"))).toBe("terminal output");
    expect(contentLabel(detect("# Heading"))).toBe("Markdown");
    expect(contentLabel(detect("<p>x</p>"))).toBe("HTML");
    expect(contentLabel(detect("| a | b |\n| 1 | 2 |"))).toBe("a table");
    expect(contentLabel(detect("plain prose"))).toBe("text");
  });
});
