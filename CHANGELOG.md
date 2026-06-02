# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Initial release: `sickofcodeblocks` / `socb` CLI.
- Core pipeline: OSC 8 hyperlink rewrite, carriage-return/spinner collapse,
  augmented ANSI/OSC/DCS/APC escape stripping, Nerd Font/Powerline glyph
  removal, box-drawing table reconstruction, smart-punctuation → ASCII,
  whitespace normalization.
- `--emulate` headless-terminal mode for multi-line redraws.
- `--redact` secret/PII masking.
- `--slack` / `--email` / `--plain` presets.
- `--clip` clipboard input/output.
- `--watch` clipboard-watch mode: clean every copy in place automatically.
- Config file (`~/.socbrc.json` / `./.socbrc.json`) for persistent default options.
