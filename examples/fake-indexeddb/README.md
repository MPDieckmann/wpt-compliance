# WPT IndexedDB Compliance — fake-indexeddb Example

This example uses [`wpt-compliance`](https://www.npmjs.com/package/wpt-compliance) to run the official [WPT IndexedDB test suite](https://github.com/web-platform-tests/wpt/tree/master/IndexedDB) against [`fake-indexeddb`](https://www.npmjs.com/package/fake-indexeddb), a pure-JS in-memory IndexedDB implementation.

## Setup

```bash
bun install
```

## Run

```bash
# Run all 209 IndexedDB WPT tests
bun run index.ts

# Verbose mode — show individual test results
bun run index.ts --debug

# Only run cursor-related tests
bun run index.ts --filter="cursor"

# Stop on first failure
bun run index.ts --bail
```

## Results

With `fake-indexeddb@6.2.5` on Bun 1.x:

| Metric         | Value           |
| -------------- | --------------- |
| Files passed   | 106 / 209 (51%) |
| Tests passed   | 743 / 1092 (68%) |
| Tests failed   | 349             |
| Errors         | 2               |

Most failures are caused by `fake-indexeddb` throwing `DOMException` instances from a different global than the test harness expects (_"threw an exception from the wrong global"_). This is a known limitation of pure-JS polyfills that construct their own `DOMException` objects instead of using the engine's built-in class.

## How it works

1. `wpt-compliance` downloads the IndexedDB `.any.js` test files from the WPT GitHub repository (cached in `.wpt-cache/`).
2. Before each test file, `wpt.config.ts` injects `fake-indexeddb`'s globals (`indexedDB`, `IDBDatabase`, etc.) into `globalThis`.
3. The WPT `testharness.js` runner executes the tests as if in a browser.
4. After each file, globals are cleaned up to prevent state leakage.

## Project structure

```
├── index.ts          # Main entry point — fetches & runs tests
├── wpt.config.ts     # Wires fake-indexeddb into globalThis
├── package.json
└── .wpt-cache/       # Auto-created: cached WPT test files
```
