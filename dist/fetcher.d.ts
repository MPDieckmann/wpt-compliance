export declare const WPT_REPO = "web-platform-tests/wpt";
export declare const WPT_BRANCH = "master";
export declare const RAW_BASE = "https://raw.githubusercontent.com/web-platform-tests/wpt/master";
export declare const API_BASE = "https://api.github.com/repos/web-platform-tests/wpt";
/** Options for {@link fetchFeature}. */
export interface FetchFeatureOptions {
    /** Where to store downloaded files. @default ".wpt-cache" (resolved from cwd) */
    cacheDir?: string;
    /** Re-download even if cached. @default false */
    force?: boolean;
    /** Show download progress details. @default false */
    verbose?: boolean;
    /** Only fetch test files matching these regex patterns. Non-test deps always included. */
    include?: string[] | null;
}
/** Result returned by {@link fetchFeature}. */
export interface FetchFeatureResult {
    /** Absolute path to the cache directory. */
    cacheDir: string;
    /** Absolute paths to all downloaded files. */
    files: string[];
}
/** Information about a locally-cached WPT feature. */
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
 * @example
 * ```ts
 * import { fetchFeature } from "wpt-compliance/fetcher";
 *
 * const { cacheDir, files } = await fetchFeature("url", {
 *   cacheDir: ".wpt-cache",
 *   force: false,
 *   verbose: true,
 * });
 * ```
 */
export declare function fetchFeature(feature: string, options?: FetchFeatureOptions): Promise<FetchFeatureResult>;
/**
 * List all locally-cached WPT features.
 *
 * @example
 * ```ts
 * import { listCachedFeatures } from "wpt-compliance/fetcher";
 *
 * const features = listCachedFeatures();
 * for (const f of features) {
 *   console.log(`${f.feature}: ${f.testFiles} tests (fetched ${f.fetchedAt})`);
 * }
 * ```
 */
export declare function listCachedFeatures(cacheDir?: string): CachedFeatureInfo[];
//# sourceMappingURL=fetcher.d.ts.map