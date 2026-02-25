#!/usr/bin/env node
// src/cli.ts — CLI entry point for wpt-compliance
//
// Commands:
//   wpt fetch <feature>          Download WPT test files for a feature
//   wpt run <feature> [files..]  Run WPT tests for a feature
//   wpt list                     List cached features
//   wpt <feature> [files..]      Shorthand: fetch + run
//
// Flags:
//   -d, --debug           Verbose output with per-test results and stacks
//   -c, --continue        Continue running after first file failure
//   -f, --force           Force re-download (fetch/default command)
//   --filter=<regex>      Only run files matching pattern
//   --timeout=<ms>        Override base timeout (default: 30000)
//   --preload=<path>      Preload a script (can be used multiple times)
//   --config=<path>       Path to wpt.config.js
//   --cache-dir=<dir>     Cache directory (default: .wpt-cache)
//   -h, --help            Show help
//   --version             Show version
import { fetchFeature, listCachedFeatures } from "./fetcher.js";
import { runWPT } from "./runner.js";
import { loadConfig, DEFAULT_CACHE_DIR } from "./index.js";
import { resolve } from "path";
import { readFileSync } from "fs";
// ─── Parse arguments ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flags = {
    debug: false,
    continue: false,
    force: false,
    filter: "",
    timeout: 30000,
    preload: [],
    config: "",
    cacheDir: DEFAULT_CACHE_DIR,
    help: false,
    version: false,
};
const positional = [];
for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-d" || arg === "--debug")
        flags.debug = true;
    else if (arg === "-c" || arg === "--continue")
        flags.continue = true;
    else if (arg === "-f" || arg === "--force")
        flags.force = true;
    else if (arg === "-h" || arg === "--help")
        flags.help = true;
    else if (arg === "--version")
        flags.version = true;
    else if (arg.startsWith("--filter="))
        flags.filter = arg.slice("--filter=".length);
    else if (arg.startsWith("--timeout="))
        flags.timeout = parseInt(arg.slice("--timeout=".length), 10);
    else if (arg.startsWith("--preload="))
        flags.preload.push(arg.slice("--preload=".length));
    else if (arg.startsWith("--config="))
        flags.config = arg.slice("--config=".length);
    else if (arg.startsWith("--cache-dir="))
        flags.cacheDir = arg.slice("--cache-dir=".length);
    else if (arg.startsWith("-")) {
        console.error(`Unknown flag: ${arg}`);
        process.exit(1);
    }
    else
        positional.push(arg);
}
// ─── Help ───────────────────────────────────────────────────────────────────
if (flags.help) {
    console.log(`
wpt — Run web-platform-tests against Bun/Node.js

Usage:
  wpt <feature> [files..]            Fetch & run WPT tests
  wpt fetch <feature>                Download WPT test files
  wpt run <feature> [files..]        Run already-cached tests
  wpt list                           List cached features

Flags:
  -d, --debug           Verbose output (per-test results, stacks)
  -c, --continue        Continue after first file failure
  -f, --force           Force re-download even if cached
  --filter=<regex>      Only run files matching regex
  --timeout=<ms>        Base timeout per test file (default: 30000)
  --preload=<path>      Preload a script before each test (repeatable)
  --config=<path>       Path to wpt.config.js
  --cache-dir=<dir>     Cache directory (default: .wpt-cache)
  -h, --help            Show this help
  --version             Show version

Examples:
  wpt url                            # fetch + run URL tests
  wpt url historical.any.js          # run specific test file
  wpt run url -d -c                  # debug mode, continue on failure
  wpt fetch IndexedDB --force        # force re-download
  wpt list                           # list what's cached
  wpt url --preload=./setup.js       # preload a setup script
`);
    process.exit(0);
}
// ─── Version ────────────────────────────────────────────────────────────────
if (flags.version) {
    try {
        const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
        console.log(`wpt v${pkg.version}`);
    }
    catch {
        console.log("wpt (unknown version)");
    }
    process.exit(0);
}
// ─── Commands ───────────────────────────────────────────────────────────────
const command = positional[0];
const absCacheDir = resolve(process.cwd(), flags.cacheDir);
async function doRun(feature, files) {
    // Load config
    let featureConfig = {};
    if (flags.config) {
        featureConfig = await loadConfig(resolve(process.cwd(), flags.config), feature);
    }
    else {
        // Try default config locations
        for (const name of ["wpt.config.js", "wpt.config.mjs"]) {
            const path = resolve(process.cwd(), name);
            try {
                featureConfig = await loadConfig(path, feature);
                if (Object.keys(featureConfig).length > 0)
                    break;
            }
            catch {
                /* ignore */
            }
        }
    }
    const result = await runWPT(feature, {
        wptRoot: absCacheDir,
        files,
        filter: flags.filter,
        timeout: flags.timeout,
        debug: flags.debug,
        continueOnFail: flags.continue,
        preload: flags.preload,
        config: featureConfig,
    });
    // Exit code
    if (result.failed > 0 || result.errors > 0) {
        process.exit(1);
    }
}
async function main() {
    if (!command) {
        console.error("Error: No command or feature specified. Use --help for usage.");
        process.exit(1);
    }
    // ── list ──
    if (command === "list") {
        const features = listCachedFeatures(absCacheDir);
        if (features.length === 0) {
            console.log("No cached features. Use `wpt fetch <feature>` to download tests.");
        }
        else {
            console.log("Cached WPT features:\n");
            for (const f of features) {
                console.log(`  • ${f.feature}  (${f.testFiles} test files, ${f.files} total, fetched ${f.fetchedAt})`);
            }
            console.log("");
        }
        return;
    }
    // ── fetch ──
    if (command === "fetch") {
        const feature = positional[1];
        if (!feature) {
            console.error("Error: Missing feature name. Usage: wpt fetch <feature>");
            process.exit(1);
        }
        console.log(`\n📦 Fetching WPT tests for "${feature}"...\n`);
        await fetchFeature(feature, {
            cacheDir: absCacheDir,
            force: flags.force,
            verbose: flags.debug,
        });
        console.log(`\n✅ Done. Tests cached in ${flags.cacheDir}/${feature}/\n`);
        return;
    }
    // ── run (explicit) ──
    if (command === "run") {
        const feature = positional[1];
        if (!feature) {
            console.error("Error: Missing feature name. Usage: wpt run <feature> [files..]");
            process.exit(1);
        }
        const files = positional.slice(2);
        await doRun(feature, files);
        return;
    }
    // ── default: fetch + run ──
    const feature = command;
    const files = positional.slice(1);
    console.log(`\n📦 Fetching WPT tests for "${feature}"...\n`);
    await fetchFeature(feature, {
        cacheDir: absCacheDir,
        force: flags.force,
        verbose: flags.debug,
    });
    await doRun(feature, files);
}
main().catch((err) => {
    console.error(`\n❌ ${err.message}\n`);
    if (flags.debug && err.stack)
        console.error(err.stack);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map