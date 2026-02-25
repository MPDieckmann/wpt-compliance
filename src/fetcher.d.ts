// Type definitions for wpt-compliance/fetcher

/**
 * GitHub repository identifier.
 */
export declare const WPT_REPO: string;

/**
 * Git branch to fetch from (default: "master").
 */
export declare const WPT_BRANCH: string;

/**
 * Base URL for raw file downloads from GitHub.
 */
export declare const RAW_BASE: string;

/**
 * Base URL for the GitHub Contents API.
 */
export declare const API_BASE: string;

/**
 * Options for `fetchFeature()`.
 */
export interface FetchFeatureOptions {
  /**
   * Where to store downloaded files.
   * @default ".wpt-cache" (resolved from `process.cwd()`)
   */
  cacheDir?: string;

  /**
   * Re-download even if cached.
   * @default false
   */
  force?: boolean;

  /**
   * Show download progress details.
   * @default false
   */
  verbose?: boolean;

  /**
   * Only fetch test files matching these regex patterns.
   * Non-test dependencies are always included.
   */
  include?: string[] | null;
}

/**
 * Result returned by `fetchFeature()`.
 */
export interface FetchFeatureResult {
  /** Absolute path to the cache directory. */
  cacheDir: string;

  /** Absolute paths to all downloaded files. */
  files: string[];
}

/**
 * Information about a locally-cached WPT feature.
 */
export interface CachedFeatureInfo {
  /** Feature name (e.g. "url", "IndexedDB"). */
  feature: string;

  /** Total number of cached files for this feature. */
  files: number;

  /** Number of `.any.js` test files. */
  testFiles: number;

  /** ISO 8601 timestamp of when the feature was fetched. */
  fetchedAt: string;
}

/**
 * Download WPT tests for a specific feature into a local cache directory.
 *
 * Fetches `.any.js` test files, their `META: script=` dependencies,
 * inline `fetch()` resource references (JSON), and `resources/testharness.js`.
 *
 * @param feature - Feature directory name (e.g. `"IndexedDB"`, `"url"`)
 * @param options - Fetch options
 * @returns Downloaded file paths and cache directory location
 *
 * @example
 * ```js
 * import { fetchFeature } from "wpt-compliance/fetcher";
 *
 * const { cacheDir, files } = await fetchFeature("url", {
 *   cacheDir: ".wpt-cache",
 *   force: false,
 *   verbose: true,
 * });
 * ```
 */
export declare function fetchFeature(
  feature: string,
  options?: FetchFeatureOptions,
): Promise<FetchFeatureResult>;

/**
 * List all locally-cached WPT features.
 *
 * @param cacheDir - Path to the cache directory (default: `.wpt-cache` in cwd)
 * @returns Array of cached feature info objects
 *
 * @example
 * ```js
 * import { listCachedFeatures } from "wpt-compliance/fetcher";
 *
 * const features = listCachedFeatures();
 * for (const f of features) {
 *   console.log(`${f.feature}: ${f.testFiles} tests (fetched ${f.fetchedAt})`);
 * }
 * ```
 */
export declare function listCachedFeatures(
  cacheDir?: string,
): CachedFeatureInfo[];
