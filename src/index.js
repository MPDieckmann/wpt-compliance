// src/index.js — Public API for wpt-compliance
//
// Usage:
//   import { fetchFeature, runTests, defineConfig } from "wpt-compliance";
//
//   await fetchFeature("url");
//   const results = await runTests("url", { debug: true });

export { fetchFeature, listCachedFeatures } from "./fetcher.js";
export {
  runWPT as runTests,
  runTestFile,
  parseMeta,
  findTestFiles,
} from "./runner.js";

import { fetchFeature } from "./fetcher.js";
import { runWPT } from "./runner.js";
import { resolve } from "path";
import { existsSync } from "fs";

/**
 * Default cache directory for downloaded WPT files.
 */
export const DEFAULT_CACHE_DIR = ".wpt-cache";

/**
 * Define a per-feature configuration object.
 * Provides validation and serves as documentation for the config shape.
 *
 * @param {Record<string, {preload?: string[], setup?: Function, cleanup?: Function, globals?: string[]}>} config
 * @returns {Record<string, object>}
 */
export function defineConfig(config) {
  return config;
}

/**
 * Load a wpt.config.js file and resolve the config for a given feature.
 *
 * @param {string} configPath - Absolute path to the config file
 * @param {string} feature    - Feature name (e.g. "IndexedDB", "url/foo")
 * @returns {Promise<object>} Resolved config for the feature
 */
export async function loadConfig(configPath, feature) {
  if (!existsSync(configPath)) return {};
  const mod = await import(configPath);
  const config = mod.default || mod;

  // Try exact match, then progressively shorter parent paths, then "*"
  const parts = feature.split("/");
  for (let i = parts.length; i >= 1; i--) {
    const key = parts.slice(0, i).join("/");
    if (config[key]) return config[key];
  }
  return config["*"] || {};
}

/**
 * High-level convenience: fetch + run in one call.
 *
 * @param {string} feature      - Feature name (e.g. "url")
 * @param {object} options
 * @param {string}   options.cacheDir      - Where to cache WPT files (default: ".wpt-cache")
 * @param {boolean}  options.force         - Force re-download
 * @param {boolean}  options.debug         - Verbose output
 * @param {boolean}  options.continueOnFail - Continue running after failures
 * @param {string[]} options.files         - Specific test files to run
 * @param {string}   options.filter        - Regex filter for test files
 * @param {number}   options.timeout       - Timeout in ms
 * @param {string[]} options.preload       - Preload script paths
 * @param {object}   options.config        - Feature config object
 * @param {string}   options.configFile    - Path to wpt.config.js
 * @param {boolean}  options.silent        - Suppress output
 * @returns {Promise<object>} Test results summary
 */
export async function fetchAndRun(feature, options = {}) {
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
  let featureConfig = configOverride || {};
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
