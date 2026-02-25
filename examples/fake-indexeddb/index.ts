// index.ts — Run WPT IndexedDB tests against fake-indexeddb
//
// Usage:
//   bun run index.ts                    # run all IndexedDB WPT tests
//   bun run index.ts --debug            # verbose output
//   bun run index.ts --filter="cursor"  # only cursor tests
//
// This example shows how to use wpt-compliance to verify that a
// third-party IndexedDB polyfill (fake-indexeddb) conforms to the
// W3C IndexedDB specification via the official WPT test suite.

import { fetchAndRun } from "wpt-compliance";

// ─── Parse CLI flags ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const debug = args.includes("--debug") || args.includes("-d");
const continueOnFail = !args.includes("--bail");
const filterArg = args.find((a) => a.startsWith("--filter="));
const filter = filterArg ? filterArg.split("=")[1] : undefined;

// ─── Run the tests ──────────────────────────────────────────────────────────

console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║  WPT IndexedDB Compliance Test — fake-indexeddb 6.x    ║");
console.log("╚══════════════════════════════════════════════════════════╝");
console.log();

const results = await fetchAndRun("IndexedDB", {
  configFile: new URL("./wpt.config.ts", import.meta.url).pathname,
  debug,
  continueOnFail,
  filter,
  timeout: 60_000,
});

// ─── Summary ────────────────────────────────────────────────────────────────

console.log();
console.log("═══════════════════════════════════════════════════════════");
console.log(`  Feature:      IndexedDB (fake-indexeddb)`);
console.log(`  Files:        ${results.filesRan}/${results.filesTotal}`);
console.log(`  Tests passed: ${results.passed}/${results.total}`);
console.log(`  Tests failed: ${results.failed}`);
console.log(`  Errors:       ${results.errors}`);
console.log("═══════════════════════════════════════════════════════════");

if (results.failed > 0 || results.errors > 0) {
  console.log("\n❌ Some tests failed. Run with --debug for details.\n");

  // Show top failing files
  const failing = results.files
    .filter((f) => f.failed > 0 || f.error)
    .slice(0, 10);

  if (failing.length > 0) {
    console.log("Top failing files:");
    for (const f of failing) {
      const status = f.error
        ? `  ERROR: ${f.error}`
        : `  ${f.passed}/${f.total} passed`;
      console.log(`  • ${f.file}${status}`);
    }
  }
}

process.exit(results.failed > 0 || results.errors > 0 ? 1 : 0);