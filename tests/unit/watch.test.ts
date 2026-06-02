import { describe, it, expect } from "vitest";
import { watchTick, type WatchState } from "../../src/watch.js";
import { sanitize } from "../../src/pipeline.js";

const clean = (s: string) => sanitize(s);

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
});
