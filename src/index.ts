// src/index.ts — Public API for wpt-compliance
//
// Usage:
//   import { fetchFeature, runTests, defineConfig } from "wpt-compliance";
//
//   await fetchFeature("url");
//   const results = await runTests("url", { debug: true });

export { fetchFeature, listCachedFeatures } from "./fetcher.js";
export type {
  FetchFeatureOptions,
  FetchFeatureResult,
  CachedFeatureInfo,
} from "./fetcher.js";

export {
  runWPT as runTests,
  runTestFile,
  parseMeta,
  findTestFiles,
} from "./runner.js";
export type {
  TestMeta,
  TestResult,
  HarnessStatus,
  TestFileResults,
  RunTestFileResult,
  RunTestFileOptions,
  RunWPTSummary,
  RunWPTOptions,
  FileResult,
  FeatureConfig,
} from "./runner.js";

import { fetchFeature } from "./fetcher.js";
import { runWPT, type FeatureConfig } from "./runner.js";
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
export function defineConfig(
  config: Record<string, FeatureConfig>,
): Record<string, FeatureConfig> {
  return config;
}

/**
 * Load a `wpt.config.js` file and resolve the config for a given feature.
 *
 * Resolution order: exact feature match → parent path segments → `"*"` wildcard.
 */
export async function loadConfig(
  configPath: string,
  feature: string,
): Promise<FeatureConfig> {
  if (!existsSync(configPath)) return {};
  const mod = await import(configPath);
  const config: Record<string, FeatureConfig> = mod.default || mod;

  // Try exact match, then progressively shorter parent paths, then "*"
  const parts = feature.split("/");
  for (let i = parts.length; i >= 1; i--) {
    const key = parts.slice(0, i).join("/");
    if (config[key]) return config[key];
  }
  return config["*"] || {};
}

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
export async function fetchAndRun(
  feature: string,
  options: FetchAndRunOptions = {},
) {
  const {
    cacheDir = DEFAULT_CACHE_DIR,
    force = false,
    debug = false,
    continueOnFail = true,
    files = [],
    filter = "",
    timeout = 30000,
    preload = [],
    config: configOverride,
    configFile,
    silent = false,
  } = options;

  const absCacheDir = resolve(process.cwd(), cacheDir);

  // 1. Fetch the feature
  if (!silent) console.log(`\n📦 Fetching WPT tests for "${feature}"...\n`);
  await fetchFeature(feature, {
    cacheDir: absCacheDir,
    force,
    verbose: debug,
  });

  // 2. Resolve config
  let featureConfig: FeatureConfig = configOverride || {};
  if (!configOverride && configFile) {
    featureConfig = await loadConfig(
      resolve(process.cwd(), configFile),
      feature,
    );
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
