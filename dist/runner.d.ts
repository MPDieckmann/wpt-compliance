/** Parsed `// META:` directives from a WPT test file. */
export interface TestMeta {
    /** Target globals (e.g. `["window", "worker"]`). */
    global: string[];
    /** Paths from `META: script=` directives. */
    scripts: string[];
    /** Timeout hint: `"normal"` or `"long"`. */
    timeout: string;
    /** Test title from `META: title=`. */
    title: string;
    /** URL variants from `META: variant=`. */
    variant: string[];
}
/**
 * Individual test result within a test file.
 * Status codes: 0=PASS, 1=FAIL, 2=TIMEOUT, 3=NOTRUN, 4=PRECONDITION_FAILED
 */
export interface TestResult {
    /** Test name / description. */
    name: string;
    /** Numeric status code. */
    status: number;
    /** Failure message, if any. */
    message: string | null;
    /** Stack trace, if available. */
    stack: string | null;
}
/** Harness-level status object returned by `add_completion_callback`. */
export interface HarnessStatus {
    status: number;
    message: string | null;
    stack: string | null;
}
/** Raw results collected from a single test file execution. */
export interface TestFileResults {
    tests: TestResult[];
    status: HarnessStatus | null;
    asserts: unknown[];
}
/** Result of running a single test file via {@link runTestFile}. */
export interface RunTestFileResult {
    /** Relative path of the test file (from wptRoot). */
    file: string;
    /** Error message if the test errored/timed out, otherwise `null`. */
    error: string | null;
    /** Collected test results. */
    results: TestFileResults;
}
/** Per-feature configuration object (from `wpt.config.js`). */
export interface FeatureConfig {
    /** Scripts to preload before each test file (relative to wptRoot). */
    preload?: string[];
    /** Setup function called before each test file. */
    setup?: (context: {
        testFilePath: string;
        testName: string;
        meta: TestMeta;
        globalThis: typeof globalThis;
    }) => void | Promise<void>;
    /** Cleanup function called between test files to reset state. */
    cleanup?: () => void;
    /** Additional global variable names to clean up between test runs. */
    globals?: string[];
    /** Per-feature timeout in ms. Overrides the global timeout option. */
    timeout?: number;
}
/** Options for {@link runTestFile}. */
export interface RunTestFileOptions {
    /** Root directory containing WPT files. @default `process.cwd()` */
    wptRoot?: string;
    /** Base timeout in milliseconds. ×6 for `META: timeout=long`. @default 30000 */
    timeout?: number;
    /** Preload script paths to import before each test. */
    preload?: string[];
    /** Per-feature configuration from `wpt.config.js`. */
    featureConfig?: FeatureConfig;
    /** Enable debug logging. @default false */
    debug?: boolean;
}
/** Per-file summary within {@link RunWPTSummary.files}. */
export interface FileResult {
    file: string;
    passed: number;
    failed: number;
    total: number;
    error: string | null;
    tests: TestResult[];
}
/** Summary returned by {@link runWPT}. */
export interface RunWPTSummary {
    feature: string;
    passed: number;
    failed: number;
    errors: number;
    total: number;
    filesRan: number;
    filesTotal: number;
    aborted: boolean;
    files: FileResult[];
}
/** Options for {@link runWPT}. */
export interface RunWPTOptions {
    /** Root directory containing WPT files. @default `process.cwd()` */
    wptRoot?: string;
    /** Specific test file names to run. If empty, all `.any.js` files are discovered. */
    files?: string[];
    /** Regex filter applied to test file paths. */
    filter?: string;
    /** Base timeout in milliseconds. @default 30000 */
    timeout?: number;
    /** Enable verbose/debug output. @default false */
    debug?: boolean;
    /** Continue running after test failures. @default true */
    continueOnFail?: boolean;
    /** Preload script paths to import before each test. */
    preload?: string[];
    /** Per-feature configuration (same shape as a `wpt.config.js` entry). */
    config?: FeatureConfig;
    /** Suppress all console output. @default false */
    silent?: boolean;
}
/**
 * Parse `// META:` directives from a WPT test file source.
 *
 * @example
 * ```ts
 * const meta = parseMeta(source);
 * console.log(meta.scripts); // ["/resources/testharness.js", "./support.js"]
 * ```
 */
export declare function parseMeta(source: string): TestMeta;
/** Recursively find all `.any.js` test files in a directory. */
export declare function findTestFiles(dir: string): string[];
/**
 * Run a single WPT test file.
 *
 * @example
 * ```ts
 * import { runTestFile } from "wpt-compliance/runner";
 *
 * const result = await runTestFile("/path/to/url/url-constructor.any.js", {
 *   wptRoot: ".wpt-cache",
 *   timeout: 30000,
 * });
 * console.log(result.results.tests.length, "tests ran");
 * ```
 */
export declare function runTestFile(testFilePath: string, options?: RunTestFileOptions): Promise<RunTestFileResult>;
/**
 * Run all WPT tests for a feature. This is the main programmatic API.
 *
 * Discovers `.any.js` files, evaluates each in a sandboxed global scope
 * with `testharness.js`, and collects results.
 *
 * @example
 * ```ts
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
export declare function runWPT(feature: string, options?: RunWPTOptions): Promise<RunWPTSummary>;
//# sourceMappingURL=runner.d.ts.map