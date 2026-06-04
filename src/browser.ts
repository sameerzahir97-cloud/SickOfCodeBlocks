// Browser entry point for the web playground (docs/index.html).
//
// Exposes ONLY the dependency-free API: sanitize() + presetPatch(). It deliberately
// omits config/watch/decode/summarize, which use node:fs / node:child_process /
// Buffer and would break a browser bundle. The core sanitize() is pure string->string
// when `emulate` is off (the default and only path used here).
export { sanitize, DEFAULTS, type SanitizeOptions, type TableMode, type Newline } from "./pipeline.js";
export { presetPatch, type Preset } from "./presets.js";
