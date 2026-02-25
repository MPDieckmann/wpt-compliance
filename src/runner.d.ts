// Type definitions for wpt-compliance/runner

/**
 * Parsed `// META:` directives from a WPT test file.
 */
export interface TestMeta {
  /** Target globals (e.g. `["window", "worker"]`). */
  global: string[];

  /** Paths from `META: script=` directives. */
  scripts: string[];

  /** Timeout hint: `"normal"` or `"long"`. */
  timeout: "normal" | "long";

  /** Test title from `META: title=`. */
  title: string;

  /** URL variants from `META: variant=`. */
  variant: string[];
}

/**
 * Individual test result within a test file.
 */
export interface TestResult {
  /** Test name / description. */
  name: string;

  /**
   * Numeric status code:
   * - `0` — PASS
   * - `1` — FAIL
   * - `2` — TIMEOUT
   * - `3` — NOTRUN
   * - `4` — PRECONDITION_FAILED
   */
  status: 0 | 1 | 2 | 3 | 4;

  /** Failure message, if any. */
  message: string | null;

  /** Stack trace, if available. */
  stack: string | null;
}

/**
 * Harness-level status object returned by `add_completion_callback`.
 */
export interface HarnessStatus {
  status: number;
  message: string | null;
  stack: string | null;
}

/**
 * Raw results collected from a single test file execution.
 */
export interface TestFileResults {
  /** Individual test results. */
  tests: TestResult[];

  /** Harness-level status, or `null` if not yet completed. */
  status: HarnessStatus | null;

  /** Assertion-level results. */
  asserts: unknown[];
}

/**
 * Result of running a single test file via `runTestFile()`.
 */
export interface RunTestFileResult {
  /** Relative path of the test file (from wptRoot). */
  file: string;

  /** Error message if the test errored/timed out, otherwise `null`. */
  error: string | null;

  /** Collected test results. */
  results: TestFileResults;
}

/**
 * Per-feature configuration object (from `wpt.config.js`).
 */
export interface FeatureConfig {
  /**
   * Scripts to preload before each test file (relative to wptRoot).
   */
  preload?: string[];

  /**
   * Setup function called before each test file.
   */
  setup?: (context: {
    testFilePath: string;
    testName: string;
    meta: TestMeta;
    globalThis: typeof globalThis;
  }) => void | Promise<void>;

  /**
   * Cleanup function called between test files to reset state.
   */
  cleanup?: () => void;

  /**
   * Additional global variable names to clean up between test runs.
   */
  globals?: string[];
}

/**
 * Options for `runTestFile()`.
 */
export interface RunTestFileOptions {
  /**
   * Root directory containing WPT files (for resolving `/resources/...`).
   * @default `process.cwd()`
   */
  wptRoot?: string;

  /**
   * Base timeout in milliseconds. Doubled for `META: timeout=long` tests.
   * @default 30000
   */
  timeout?: number;

  /**
   * Preload script paths to import before each test.
   */
  preload?: string[];

  /**
   * Per-feature configuration from `wpt.config.js`.
   */
  featureConfig?: FeatureConfig;

  /**
   * Enable debug logging.
   * @default false
   */
  debug?: boolean;
}

/**
 * Per-file summary within `RunWPTSummary.files`.
 */
export interface FileResult {
  /** Relative path of the test file. */
  file: string;

  /** Number of passed tests in this file. */
  passed: number;

  /** Number of failed tests in this file. */
  failed: number;

  /** Total number of tests in this file. */
  total: number;

  /** Error message if the file errored, otherwise `null`. */
  error: string | null;

  /** Individual test results. */
  tests: TestResult[];
}

/**
 * Summary returned by `runWPT()` / `runTests()`.
 */
export interface RunWPTSummary {
  /** Feature name that was tested. */
  feature: string;

  /** Total passed tests across all files. */
  passed: number;

  /** Total failed tests across all files. */
  failed: number;

  /** Number of files that errored (timeout, script error, etc.). */
  errors: number;

  /** Total tests (passed + failed). */
  total: number;

  /** Number of test files actually executed. */
  filesRan: number;

  /** Total number of discovered test files. */
  filesTotal: number;

  /** Whether the run was aborted early (when `continueOnFail` is `false`). */
  aborted: boolean;

  /** Per-file results. */
  files: FileResult[];
}

/**
 * Options for `runWPT()` / `runTests()`.
 */
export interface RunWPTOptions {
  /**
   * Root directory containing WPT files.
   * @default `process.cwd()`
   */
  wptRoot?: string;

  /**
   * Specific test file names to run (relative to the feature directory).
   * If empty, all `.any.js` files are discovered.
   */
  files?: string[];

  /**
   * Regex filter applied to test file paths.
   */
  filter?: string;

  /**
   * Base timeout in milliseconds.
   * @default 30000
   */
  timeout?: number;

  /**
   * Enable verbose/debug output.
   * @default false
   */
  debug?: boolean;

  /**
   * Continue running after test failures.
   * @default true
   */
  continueOnFail?: boolean;

  /**
   * Preload script paths to import before each test.
   */
  preload?: string[];

  /**
   * Per-feature configuration (same shape as a `wpt.config.js` entry).
   */
  config?: FeatureConfig;

  /**
   * Suppress all console output.
   * @default false
   */
  silent?: boolean;
}

/**
 * Parse `// META:` directives from a WPT test file source.
 *
 * @param source - Source code of a `.any.js` test file
 * @returns Parsed meta directives
 *
 * @example
 * ```js
 * import { parseMeta } from "wpt-compliance/runner";
 *
 * const meta = parseMeta(source);
 * console.log(meta.scripts); // ["/resources/testharness.js", "./support.js"]
 * ```
 */
export declare function parseMeta(source: string): TestMeta;

/**
 * Recursively find all `.any.js` test files in a directory.
 *
 * @param dir - Absolute path to search
 * @returns Array of absolute file paths
 */
export declare function findTestFiles(dir: string): string[];

/**
 * Run a single WPT test file.
 *
 * @param testFilePath - Absolute path to the `.any.js` file
 * @param options - Execution options
 * @returns Test results for the file
 *
 * @example
 * ```js
 * import { runTestFile } from "wpt-compliance/runner";
 *
 * const result = await runTestFile("/path/to/url/url-constructor.any.js", {
 *   wptRoot: ".wpt-cache",
 *   timeout: 30000,
 * });
 * console.log(result.results.tests.length, "tests ran");
 * ```
 */
export declare function runTestFile(
  testFilePath: string,
  options?: RunTestFileOptions,
): Promise<RunTestFileResult>;

/**
 * Run all WPT tests for a feature. This is the main programmatic API.
 *
 * Discovers `.any.js` files, evaluates each in a sandboxed global scope
 * with `testharness.js`, and collects results.
 *
 * @param feature - Feature name (e.g. `"url"`, `"IndexedDB"`)
 * @param options - Run options
 * @returns Aggregated test results summary
 *
 * @example
 * ```js
 * import { runWPT } from "wpt-compliance/runner";
 *
 * const summary = await runWPT("url", {
 *   wptRoot: ".wpt-cache",
 *   debug: true,
 *   continueOnFail: true,
 * });
 * console.log(`${summary.passed}/${summary.total} passed`);
 * ```
 */
export declare function runWPT(
  feature: string,
  options?: RunWPTOptions,
): Promise<RunWPTSummary>;
