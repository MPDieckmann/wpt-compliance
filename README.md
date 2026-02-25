# wpt-compliance

Run [web-platform-tests (WPT)](https://github.com/web-platform-tests/wpt) against your Bun/Node.js implementations — downloading **only the tests you need** instead of the full 1 GB+ repo.

> **Disclaimer**: This project is not affiliated with, endorsed by, or sponsored by the [web-platform-tests](https://github.com/web-platform-tests) project. WPT test files downloaded at runtime are licensed under the [BSD 3-Clause License](https://github.com/web-platform-tests/wpt/blob/master/LICENSE.md) by the web-platform-tests contributors. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for details.

## Requirements

- **Node.js >= 18** or **Bun** (needs global `fetch()` and `Response`)

## Installation

```bash
# From npm
npm install --save-dev wpt-compliance

# Or with bun
bun add -d wpt-compliance
```

## Quick Start

### CLI

```bash
# Fetch + run in one command
wpt url

# Fetch tests for a feature
wpt fetch IndexedDB

# Run previously cached tests
wpt run IndexedDB -c -d

# Run a specific test file
wpt url historical.any.js

# List cached features
wpt list
```

### Programmatic API

```js
import { fetchFeature, runTests } from "wpt-compliance";

// Download only the URL tests (~22 .any.js files)
await fetchFeature("url");

// Run them
const results = await runTests("url", {
    continueOnFail: true,
    debug: false,
});

console.log(`${results.passed}/${results.total} tests passed`);
```

### Fetch + Run in one call

```js
import { fetchAndRun } from "wpt-compliance";

const results = await fetchAndRun("console", {
    debug: true,
    continueOnFail: true,
});
```

### With custom library setup (e.g. IndexedDB polyfill)

```js
import { fetchAndRun, defineConfig } from "wpt-compliance";

const results = await fetchAndRun("IndexedDB", {
    preload: ["./my-indexeddb/setup.js"],
    config: {
        preload: ["./my-indexeddb/globals.js"],
        globals: ["indexedDB", "IDBDatabase", "IDBTransaction"],
        async setup({ testFilePath, meta }) {
            // Called before each test file
        },
        cleanup() {
            // Called between test files
        },
    },
});
```

## CLI Reference

```
wpt <feature> [files..]            Fetch & run WPT tests
wpt fetch <feature>                Download WPT test files
wpt run <feature> [files..]        Run already-cached tests
wpt list                           List cached features
```

### Flags

| Flag                | Short | Description                                                      |
| ------------------- | ----- | ---------------------------------------------------------------- |
| `--debug`           | `-d`  | Verbose output: shows every individual test result with stacks   |
| `--continue`        | `-c`  | Continue running after first file failure (default: abort)       |
| `--force`           | `-f`  | Force re-download even if cached                                 |
| `--filter=<regex>`  |       | Only run files matching regex pattern                            |
| `--timeout=<ms>`    |       | Base timeout per test file (default: 30000, `long` tests get 6x) |
| `--preload=<path>`  |       | Preload a script before each test (repeatable)                   |
| `--config=<path>`   |       | Path to `wpt.config.js`                                          |
| `--cache-dir=<dir>` |       | Cache directory (default: `.wpt-cache`)                          |
| `--help`            | `-h`  | Show help                                                        |
| `--version`         |       | Show version                                                     |

## Configuration File

Create a `wpt.config.js` in your project root:

```js
import { defineConfig } from "wpt-compliance";

export default defineConfig({
    // Per-feature configuration
    IndexedDB: {
        preload: ["./my-indexeddb/setup.js"],
        globals: ["indexedDB", "IDBDatabase", "IDBTransaction", "IDBRequest"],
        async setup({ testFilePath, testName, meta, globalThis }) {
            // Called before each test file runs
        },
        cleanup() {
            // Called between test files to clean up globals
        },
    },

    // Wildcard: applies to all features without a specific config
    "*": {
        timeout: 60000,
    },
});
```

Config resolution order: exact feature match → parent path → `"*"` wildcard.

## How it Works

1. **Selective Download**: Uses the GitHub Contents API to list files and `raw.githubusercontent.com` to download only `.any.js` test files, `.js` helpers, and `.json` data files for the requested feature directory.

2. **Dependency Resolution**: Parses `// META: script=` directives and `fetch()` calls in test files to download referenced dependencies (e.g. `/resources/testharness.js`, `/common/utils.js`).

3. **Local Cache**: Downloads are stored in `.wpt-cache/` with a manifest file for cache invalidation. Use `--force` to re-download.

4. **Shell Environment**: Runs tests using WPT's `ShellTestEnvironment` (non-browser mode). Provides a `GLOBAL` shim, patches `fetch()` for local file access, and evaluates testharness.js + test scripts via `new Function()`.

## API Reference

### `fetchFeature(feature, options?)`

Download WPT test files for a feature from GitHub.

```ts
fetchFeature(feature: string, options?: {
  cacheDir?: string;   // default: ".wpt-cache"
  force?: boolean;     // re-download even if cached
  verbose?: boolean;   // show download progress
  include?: string[];  // regex patterns to filter test files
}): Promise<{ cacheDir: string; files: string[] }>
```

### `runTests(feature, options?)`

Run WPT tests for a feature (must be cached first).

```ts
runTests(feature: string, options?: {
  wptRoot?: string;        // root of cached WPT files
  files?: string[];        // specific test file names
  filter?: string;         // regex filter
  timeout?: number;        // base timeout in ms (default: 30000)
  debug?: boolean;         // verbose output
  continueOnFail?: boolean; // continue after failures
  preload?: string[];      // preload scripts
  config?: FeatureConfig;  // per-feature config
  silent?: boolean;        // suppress output
}): Promise<TestResults>
```

### `fetchAndRun(feature, options?)`

Convenience: fetch + run in one call. Accepts all options from both `fetchFeature` and `runTests`.

### `defineConfig(config)`

Type helper for configuration objects.

### `loadConfig(configPath, feature)`

Load and resolve a config file for a specific feature.

## GitHub Rate Limits

The GitHub API has rate limits (60 requests/hour unauthenticated). For larger features, set a GitHub token:

```bash
export GITHUB_TOKEN=ghp_your_token_here
wpt fetch IndexedDB
```

## Example Output

```
📦 Fetching WPT tests for "console"...
📦 Downloading WPT tests for "console"...
  resources/testharness.js ... ✓
  Listing console/ ... 15 files found
  Downloading: 7/7 (100%)
  ✓ Downloaded 8 files (7 test files) into .wpt-cache/console

🔍 Found 7 .any.js test file(s) in "console"

  ✓ console/console-is-a-namespace.any.js  (4/4 passed)
  ✓ console/console-tests-historical.any.js  (3/3 passed)
  ✓ console/console-log-large-array.any.js  (1/1 passed)
  ✓ console/console-log-symbol.any.js  (1/1 passed)
  ✓ console/console-label-conversion.any.js  (10/10 passed)
  ✓ console/console-namespace-object-class-string.any.js  (4/4 passed)

════════════════════════════════════════════════════════════
WPT Results: console
────────────────────────────────────────────────────────────
  Files:   6 passed, 1 failed (7/7)
  Tests:   23 passed, 1 failed, 0 errors
════════════════════════════════════════════════════════════
```

## .gitignore

Add the cache directory to your `.gitignore`:

```
.wpt-cache/
```

## License

[MIT](LICENSE) — applies to the wpt-compliance tool itself.

WPT test files downloaded at runtime are subject to the [BSD 3-Clause License](THIRD-PARTY-NOTICES.md).

## Acknowledgments

This project was created with the assistance of [GitHub Copilot](https://github.com/features/copilot) (Claude Opus 4.6 by Anthropic).
