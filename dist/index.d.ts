export { fetchFeature, listCachedFeatures } from "./fetcher.js";
export type { FetchFeatureOptions, FetchFeatureResult, CachedFeatureInfo, } from "./fetcher.js";
export { runWPT as runTests, runTestFile, parseMeta, findTestFiles } from "./runner.js";
export type { TestMeta, TestResult, HarnessStatus, TestFileResults, RunTestFileResult, RunTestFileOptions, RunWPTSummary, RunWPTOptions, FileResult, FeatureConfig, } from "./runner.js";
import { type FeatureConfig } from "./runner.js";
/**
 * Default cache directory name for downloaded WPT files.
 */
export declare const DEFAULT_CACHE_DIR = ".wpt-cache";
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
export declare function defineConfig(config: Record<string, FeatureConfig>): Record<string, FeatureConfig>;
/**
 * Load a `wpt.config.js` file and resolve the config for a given feature.
 *
 * Resolution order: exact feature match → parent path segments → `"*"` wildcard.
 */
export declare function loadConfig(configPath: string, feature: string): Promise<FeatureConfig>;
/** Options for {@link fetchAndRun}. */
export interface FetchAndRunOptions {
    /** Where to cache WPT files. @default ".wpt-cache" */
    cacheDir?: string;
    /** Force re-download of test files. @default false */
    force?: boolean;
    /** Enable verbose/debug output. @default false */
    debug?: boolean;
    /** Continue running after test failures. @default true */
    continueOnFail?: boolean;
    /** Specific test file names to run. */
    files?: string[];
    /** Regex filter for test file paths. */
    filter?: string;
    /** Base timeout in milliseconds. @default 30000 */
    timeout?: number;
    /** Preload script paths. */
    preload?: string[];
    /** Feature config object (overrides configFile). */
    config?: FeatureConfig;
    /** Path to `wpt.config.js` file. */
    configFile?: string;
    /** Suppress all console output. @default false */
    silent?: boolean;
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
export declare function fetchAndRun(feature: string, options?: FetchAndRunOptions): Promise<import("./runner.js").RunWPTSummary>;
//# sourceMappingURL=index.d.ts.map