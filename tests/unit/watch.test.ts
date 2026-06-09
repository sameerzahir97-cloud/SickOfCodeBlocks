import { describe, it, expect } from "vitest";
import { watchTick, looksMessy, type WatchState, type TickResult } from "../../src/watch.js";
import { sanitize } from "../../src/pipeline.js";

const clean = (s: string) => sanitize(s);
const cleanMd = (s: string) => sanitize(s, { markdown: true });

describe("watchTick", () => {
  it("cleans changed clipboard content and remembers its output", async () => {
    let clip = "\x1b[31mred\x1b[0m\r100%\x1b[K";
    const state: WatchState = { last: "" };
    const result = await watchTick(
      () => clip,
      (s) => {
        clip = s;
      },
      clean,
      state,
    );
    expect(result).toBe("cleaned");
    expect(clip).toBe("100%");
    expect(state.last).toBe("100%");
  });

  it("does not rewrite already-clean content (loop-safe)", async () => {
    let clip = "already clean";
    let writes = 0;
    const state: WatchState = { last: "" };
    const result = await watchTick(
      () => clip,
      () => {
        writes++;
      },
      clean,
      state,
    );
    expect(result).toBe("already-clean");
    expect(writes).toBe(0);
    expect(state.last).toBe("already clean");
  });

  it("skips when clipboard is unchanged or empty", async () => {
    const state: WatchState = { last: "same" };
    expect(await watchTick(() => "same", () => {}, clean, state)).toBe("skip");
    expect(await watchTick(() => "", () => {}, clean, state)).toBe("skip");
  });

  it("never reprocesses its own cleaned output (idempotent write)", async () => {
    let clip = "x\ry\rz"; // collapses to "z"
    let writes = 0;
    const state: WatchState = { last: "" };
    await watchTick(() => clip, (s) => { clip = s; writes++; }, clean, state);
    // second tick sees our own write (clip === state.last) -> skip
    const second = await watchTick(() => clip, (s) => { clip = s; writes++; }, clean, state);
    expect(second).toBe("skip");
    expect(writes).toBe(1);
    expect(clip).toBe("z");
  });

  it("treats a clipboard read failure as skip", async () => {
    const state: WatchState = { last: "" };
    const result = await watchTick(
      () => {
        throw new Error("clipboard busy");
      },
      () => {},
      clean,
      state,
    );
    expect(result).toBe("skip");
  });

  it("flattens Markdown by default (the watch default)", async () => {
    let clip = "# Title\n\n- **bold** item";
    const state: WatchState = { last: "" };
    const result = await watchTick(() => clip, (s) => { clip = s; }, cleanMd, state);
    expect(result).toBe("cleaned");
    expect(clip).toBe("Title\n\n- bold item");
  });

  it("does not rewrite when only the newline style differs (CRLF round-trip)", async () => {
    // state.last holds our previous LF output; the OS hands the same text back
    // with CRLF. Newline-normalized dedup must treat it as unchanged.
    let writes = 0;
    const state: WatchState = { last: "a\nb" };
    const result = await watchTick(() => "a\r\nb", () => { writes++; }, clean, state);
    expect(result).toBe("skip");
    expect(writes).toBe(0);
  });

  it("pauses: leaves the clipboard untouched and does not remember the value", async () => {
    let writes = 0;
    const state: WatchState = { last: "" };
    const result = await watchTick(
      () => "\x1b[31mred\x1b[0m",
      () => { writes++; },
      clean,
      state,
      { paused: () => true },
    );
    expect(result).toBe("skip");
    expect(writes).toBe(0);
    expect(state.last).toBe(""); // not remembered, so it processes once resumed
  });

  it("skipOnce: consumes the flag and leaves one copy untouched", async () => {
    let writes = 0;
    let skip = true;
    const state: WatchState = { last: "" };
    const result = await watchTick(
      () => "\x1b[31mred\x1b[0m",
      () => { writes++; },
      clean,
      state,
      {
        skipOnce: () => {
          if (skip) {
            skip = false;
            return true;
          }
          return false;
        },
      },
    );
    expect(result).toBe("skip");
    expect(writes).toBe(0);
    expect(skip).toBe(false); // consumed
  });

  it("dry-run: reports what would change but never writes", async () => {
    let writes = 0;
    let reported: TickResult | "" = "";
    const state: WatchState = { last: "" };
    const result = await watchTick(
      () => "\x1b[31mred\x1b[0m",
      () => { writes++; },
      clean,
      state,
      { dryRun: () => true, onResult: (r) => { reported = r; } },
    );
    expect(result).toBe("would-clean");
    expect(writes).toBe(0);
    expect(reported).toBe("would-clean");
  });

  it("records the pre-clean original so it can be undone", async () => {
    let clip = "\x1b[31mred\x1b[0m";
    const original = clip;
    const state: WatchState = { last: "" };
    await watchTick(() => clip, (s) => { clip = s; }, clean, state);
    expect(state.lastOriginal).toBe(original);
  });

  it("passes raw + cleaned to onResult on a real clean", async () => {
    let clip = "\x1b[31mred\x1b[0m";
    let seen: { raw: string; cleaned: string } | null = null;
    const state: WatchState = { last: "" };
    await watchTick(
      () => clip,
      (s) => { clip = s; },
      clean,
      state,
      { onResult: (_r, raw, cleaned) => { seen = { raw, cleaned }; } },
    );
    expect(seen).toEqual({ raw: "\x1b[31mred\x1b[0m", cleaned: "red" });
  });

  it("looksMessy detects terminal noise but not plain text", () => {
    expect(looksMessy("\x1b[31mred\x1b[0m")).toBe(true); // ANSI
    expect(looksMessy("a\rb")).toBe(true); // mid-line carriage return
    expect(looksMessy("ordinary copied text, nothing special")).toBe(false);
    expect(looksMessy("line one\nline two\n")).toBe(false); // plain newlines are fine
  });

  it("skips an un-messy clipboard when the messy-only gate is set", async () => {
    let writes = 0;
    const state: WatchState = { last: "" };
    const result = await watchTick(
      () => "ordinary copied text",
      () => { writes++; },
      clean,
      state,
      { shouldProcess: looksMessy },
    );
    expect(result).toBe("skip");
    expect(writes).toBe(0);
  });

  it("still cleans messy content under the gate, and reports via onResult", async () => {
    let clip = "\x1b[31mred\x1b[0m";
    let reported: TickResult | "" = "";
    const state: WatchState = { last: "" };
    const result = await watchTick(
      () => clip,
      (s) => { clip = s; },
      clean,
      state,
      { shouldProcess: looksMessy, onResult: (r) => { reported = r; } },
    );
    expect(result).toBe("cleaned");
    expect(clip).toBe("red");
    expect(reported).toBe("cleaned");
  });

  it("propagates a sanitize error (runWatch's loop wraps this to stay alive)", async () => {
    const state: WatchState = { last: "" };
    await expect(
      watchTick(
        () => "boom",
        () => {},
        async () => {
          throw new Error("kaboom");
        },
        state,
      ),
    ).rejects.toThrow("kaboom");
  });
});
