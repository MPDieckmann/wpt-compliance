// src/index.ts — Public API for wpt-compliance
//
// Usage:
//   import { fetchFeature, runTests, defineConfig } from "wpt-compliance";
//
//   await fetchFeature("url");
//   const results = await runTests("url", { debug: true });
export { fetchFeature, listCachedFeatures } from "./fetcher.js";
export { runWPT as runTests, runTestFile, parseMeta, findTestFiles } from "./runner.js";
import { fetchFeature } from "./fetcher.js";
import { runWPT } from "./runner.js";
import { resolve } from "path";
import { existsSync } from "fs";
/**
 * Default cache directory name for downloaded WPT files.
 */
export const DEFAULT_CACHE_DIR = ".wpt-cache";
/**
 * Define a per-feature configuration object.
 * Provides autocompletion and serves as documentation for the config shape.
 *
 * @example
 * ```ts
 * // wpt.config.ts
 * import { defineConfig } from "wpt-compliance";
 *
 * export default defineConfig({
 *   "IndexedDB": {
 *     preload: ["./path/to/my-indexeddb-polyfill.js"],
 *     globals: ["indexedDB", "IDBFactory"],
 *     timeout: 60000,
 *     setup({ globalThis }) {
 *       (globalThis as any).indexedDB = new MyIndexedDB();
 *     },
 *     cleanup() {
 *       delete (globalThis as any).indexedDB;
 *     },
 *   },
 *   "*": {
 *     // defaults for all features
 *   },
 * });
 * ```
 */
export function defineConfig(config) {
    return config;
}
/**
 * Load a `wpt.config.js` file and resolve the config for a given feature.
 *
 * Resolution order: exact feature match → parent path segments → `"*"` wildcard.
 */
export async function loadConfig(configPath, feature) {
    if (!existsSync(configPath))
        return {};
    const mod = await import(configPath);
    const config = mod.default || mod;
    // Try exact match, then progressively shorter parent paths, then "*"
    const parts = feature.split("/");
    for (let i = parts.length; i >= 1; i--) {
        const key = parts.slice(0, i).join("/");
        if (config[key])
            return config[key];
    }
    return config["*"] || {};
}
/**
 * High-level convenience: fetch WPT tests and run them in one call.
 *
 * Combines `fetchFeature()` + `runTests()` into a single step.
 *
 * @example
 * ```ts
 * import { fetchAndRun } from "wpt-compliance";
 *
 * const results = await fetchAndRun("url", {
 *   debug: true,
 *   continueOnFail: true,
 * });
 *
 * console.log(`${results.passed}/${results.total} tests passed`);
 * process.exit(results.failed > 0 ? 1 : 0);
 * ```
 */
export async function fetchAndRun(feature, options = {}) {
    const { cacheDir = DEFAULT_CACHE_DIR, force = false, debug = false, continueOnFail = true, files = [], filter = "", timeout = 30000, preload = [], config: configOverride, configFile, silent = false, } = options;
    const absCacheDir = resolve(process.cwd(), cacheDir);
    // 1. Fetch the feature
    if (!silent)
        console.log(`\n📦 Fetching WPT tests for "${feature}"...\n`);
    await fetchFeature(feature, {
        cacheDir: absCacheDir,
        force,
        verbose: debug,
    });
    // 2. Resolve config
    let featureConfig = configOverride || {};
    if (!configOverride && configFile) {
        featureConfig = await loadConfig(resolve(process.cwd(), configFile), feature);
    }
    // 3. Run tests
    return runWPT(feature, {
        wptRoot: absCacheDir,
        files,
        filter,
        timeout,
        debug,
        continueOnFail,
        preload,
        config: featureConfig,
        silent,
    });
}
//# sourceMappingURL=index.js.map