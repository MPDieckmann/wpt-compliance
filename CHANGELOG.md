# Changelog

All notable changes to **wpt-compliance** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.1] — 2026-02-25

### Fixed

- **CLI binary**: Fixed `bin` entry so that `npx wpt` / global installs work correctly (executable permissions + path format).
- **TypeScript types**: `dist/` is now included in the repository, so GitHub-based installs (`bun add github:MPDieckmann/wpt-compliance`) resolve types properly.

## [1.0.0] — 2026-02-25

### Added

- **Selective WPT downloading** — fetch only the test files you need instead of cloning the 1 GB+ WPT repository.
  - Resolves `<script src="...">` and `// META:` dependencies automatically.
  - Smart caching in `.wpt-cache/` to avoid re-downloads.
- **Test runner engine** — execute WPT `testharness.js` tests in Bun, Node.js, or Deno.
  - Full `testharness.js` lifecycle: `setup()`, `test()`, `async_test()`, `promise_test()`, `done()`.
  - Per-file and per-test result reporting with pass/fail/timeout status.
  - `// META: timeout=long` support (6× base timeout).
- **CLI** (`wpt` command):
  - `wpt <feature> [files..]` — fetch and run in one command.
  - `wpt fetch <feature>` — download tests only.
  - `wpt run <feature> [files..]` — run previously cached tests.
  - `wpt list` — show cached features.
  - Flags: `--debug`, `--continue`, `--force`, `--filter`, `--timeout`, `--preload`, `--config`, `--cache-dir`.
- **Programmatic API**:
  - `fetchFeature(feature, options)` — download WPT tests for a feature.
  - `runWPT(feature, options)` — run tests and get structured results.
  - `fetchAndRun(feature, options)` — fetch + run in one call.
  - `defineConfig(config)` — type-safe configuration helper.
  - `loadConfig(path)` — load `wpt.config.js` dynamically.
  - `listCachedFeatures(cacheDir)` — list downloaded features.
- **Configuration file** (`wpt.config.js`):
  - Per-feature config with `preload`, `globals`, `setup()`, `cleanup()`, and `timeout`.
  - Global preload scripts.
- **Full TypeScript source** with strict mode, ES2022 target, Node16 module resolution.
  - Complete `.d.ts` type declarations with declaration maps.
  - Source maps for debugging.
- **Conditional exports**:
  - `bun` / `deno` conditions resolve to TypeScript source directly (zero build step).
  - `default` resolves to compiled JavaScript for Node.js.
  - `types` resolves to `.d.ts` declarations for editor support.
- **Multi-runtime support**: tested on Bun 1.x and Node.js 18+.

[1.0.1]: https://github.com/MPDieckmann/wpt-compliance/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/MPDieckmann/wpt-compliance/releases/tag/v1.0.0
