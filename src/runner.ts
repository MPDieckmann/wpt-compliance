// src/runner.ts — Core WPT test runner, importable as a module
//
// Can be used standalone or integrated into your own test pipeline:
//   import { runWPT } from "wpt-compliance/runner";
//   const results = await runWPT("url", { wptRoot: ".wpt-cache" });

import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, dirname, join, relative } from "path";

// ─── ANSI ───────────────────────────────────────────────────────────────────

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

const TEST_STATUSES: Record<number, { label: string; color: string }> = {
  0: { label: "PASS", color: "\x1b[32m" },
  1: { label: "FAIL", color: "\x1b[31m" },
  2: { label: "TIMEOUT", color: "\x1b[33m" },
  3: { label: "NOTRUN", color: "\x1b[90m" },
  4: { label: "PRECONDITION_FAILED", color: "\x1b[35m" },
};

// ─── Types ──────────────────────────────────────────────────────────────────

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

// ─── META parser ────────────────────────────────────────────────────────────

/**
 * Parse `// META:` directives from a WPT test file source.
 *
 * @example
 * ```ts
 * const meta = parseMeta(source);
 * console.log(meta.scripts); // ["/resources/testharness.js", "./support.js"]
 * ```
 */
export function parseMeta(source: string): TestMeta {
  const meta: TestMeta = {
    global: ["window", "worker"],
    scripts: [],
    timeout: "normal",
    title: "",
    variant: [],
  };

  for (const line of source.split("\n")) {
    const match = line.match(/^\/\/\s*META:\s*(\w+)=(.+)$/);
    if (!match) {
      if (
        line.trim() &&
        !line.startsWith("//") &&
        !line.startsWith("'use strict'")
      )
        break;
      continue;
    }
    const [, key, value] = match;
    switch (key) {
      case "global":
        meta.global = value.split(",").map((s) => s.trim());
        break;
      case "script":
        meta.scripts.push(value.trim());
        break;
      case "timeout":
        meta.timeout = value.trim();
        break;
      case "title":
        meta.title = value.trim();
        break;
      case "variant":
        meta.variant.push(value.trim());
        break;
    }
  }

  return meta;
}

/**
 * Prepare script source for execution in the global scope via indirect eval.
 *
 * 1. Strips `'use strict'` — in strict-mode eval, function declarations
 *    stay eval-local instead of becoming global.
 * 2. Converts top-level `const` and `let` to `var` — block-scoped
 *    declarations in eval never become global properties, but `var` does.
 *
 * WPT scripts are meant to run at the top level of a browser page, so we
 * need these transformations for correct global variable behaviour.
 */
function prepareForGlobalEval(source: string): string {
  return source
    // Remove 'use strict' directives
    .replace(/^\s*['"]use strict['"]\s*;?/gm, "// (use strict removed for WPT runner)")
    // Convert top-level const/let to var so they become global via eval
    // Only matches declarations at the start of a line (top-level)
    .replace(/^(const|let)\s+/gm, "var ");
}

// ─── File discovery ─────────────────────────────────────────────────────────

/** Recursively find all `.any.js` test files in a directory. */
export function findTestFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTestFiles(fullPath));
    } else if (entry.name.endsWith(".any.js")) {
      results.push(fullPath);
    }
  }
  return results;
}

// ─── Single test file execution ─────────────────────────────────────────────

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
export async function runTestFile(
  testFilePath: string,
  options: RunTestFileOptions = {},
): Promise<RunTestFileResult> {
  const {
    wptRoot = process.cwd(),
    timeout = 30000,
    preload = [],
    featureConfig = {},
    debug = false,
  } = options;

  const testharnessPath = join(wptRoot, "resources", "testharness.js");
  const testSource = readFileSync(testFilePath, "utf-8");
  const meta = parseMeta(testSource);
  const testDir = dirname(testFilePath);
  const testName = relative(wptRoot, testFilePath);

  const results: TestFileResults = {
    tests: [],
    status: null,
    asserts: [],
  };

  const timeoutMs = meta.timeout === "long" ? timeout * 6 : timeout;

  return new Promise<RunTestFileResult>((resolveRun) => {
    let settled = false;
    function settle(result: RunTestFileResult) {
      if (settled) return;
      settled = true;
      // Remove process-level handlers we installed for this test
      process.removeListener("uncaughtException", onUncaughtException);
      process.removeListener("unhandledRejection", onUnhandledRejection);
      resolveRun(result);
    }

    // Catch async exceptions that escape our promise chain
    // (e.g. AggregateError from polyfill event dispatchers)
    function onUncaughtException(err: Error) {
      if (debug) console.warn(`  ⚠ Uncaught exception during "${testName}": ${err.message}`);
      // Don't crash — just swallow it so we can continue to the next test
    }
    function onUnhandledRejection(reason: any) {
      if (debug) console.warn(`  ⚠ Unhandled rejection during "${testName}": ${reason}`);
    }
    process.on("uncaughtException", onUncaughtException);
    process.on("unhandledRejection", onUnhandledRejection);

    const timer = setTimeout(() => {
      settle({
        file: testName,
        error: `Timeout after ${timeoutMs}ms`,
        results,
      });
    }, timeoutMs);

    async function execute() {
      const testharnessSource = readFileSync(testharnessPath, "utf-8");

      if (typeof (globalThis as any).self === "undefined") {
        (globalThis as any).self = globalThis;
      }

      cleanupGlobals(featureConfig);

      // GLOBAL shim
      (globalThis as any).GLOBAL = {
        isWindow: () => false,
        isShadowRealm: () => false,
        isWorker: () => false,
        isDedicatedWorker: () => false,
        isSharedWorker: () => false,
        isServiceWorker: () => false,
      };

      if (typeof (globalThis as any).subsetTestByKey === "undefined") {
        (globalThis as any).subsetTestByKey = function (
          _key: string,
          testFunc: Function,
          ...args: any[]
        ) {
          return testFunc(...args);
        };
      }

      // testharness.js — use indirect eval to keep declarations global
      (0, eval)(testharnessSource);

      // completion callback
      (globalThis as any).add_completion_callback(
        (tests: any[], harnessStatus: any, asserts: any[]) => {
          clearTimeout(timer);
          results.tests = tests.map((t) => ({
            name: t.name,
            status: t.status,
            message: t.message,
            stack: t.stack,
          }));
          results.status = harnessStatus;
          results.asserts = asserts;
          settle({ file: testName, results, error: null });
        },
      );

      // mock location
      if (typeof (globalThis as any).location === "undefined") {
        (globalThis as any).location = {
          search: "",
          href: `file://${testFilePath}`,
          origin: "file://",
          protocol: "file:",
          host: "",
          hostname: "",
          port: "",
          pathname: testFilePath,
          hash: "",
        };
      }

      (globalThis as any).get_title =
        (globalThis as any).get_title || (() => testName);

      // META: script= dependencies
      for (const scriptPath of meta.scripts) {
        let resolvedPath: string;
        if (scriptPath.startsWith("/")) {
          resolvedPath = join(wptRoot, scriptPath);
        } else {
          resolvedPath = resolve(testDir, scriptPath);
        }
        if (!existsSync(resolvedPath)) {
          if (debug)
            console.warn(
              `  ⚠ Script not found: ${scriptPath} (resolved: ${resolvedPath})`,
            );
          continue;
        }
        const scriptSource = readFileSync(resolvedPath, "utf-8");
        // Indirect eval in sloppy mode so function declarations become global
        (0, eval)(prepareForGlobalEval(scriptSource));
      }

      // Patch fetch for local files
      const originalFetch = globalThis.fetch;
      globalThis.fetch = function patchedFetch(
        input: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> {
        if (
          typeof input === "string" &&
          !input.startsWith("http://") &&
          !input.startsWith("https://") &&
          !input.startsWith("blob:") &&
          !input.startsWith("data:")
        ) {
          let filePath: string;
          if (input.startsWith("/")) {
            filePath = join(wptRoot, input);
          } else {
            filePath = resolve(testDir, input);
          }
          if (existsSync(filePath)) {
            const content = readFileSync(filePath, "utf-8");
            return Promise.resolve(
              new Response(content, {
                status: 200,
                headers: {
                  "Content-Type": filePath.endsWith(".json")
                    ? "application/json"
                    : "text/plain",
                },
              }),
            );
          }
        }
        return originalFetch.call(globalThis, input, init!);
      };

      // Preloads from config
      for (const p of featureConfig.preload || []) {
        const absPath = resolve(wptRoot, p);
        if (existsSync(absPath)) await import(absPath);
        else if (debug) console.warn(`  ⚠ Config preload not found: ${p}`);
      }

      // Preloads from options
      for (const p of preload) {
        const absPath = resolve(process.cwd(), p);
        if (existsSync(absPath)) await import(absPath);
        else if (debug) console.warn(`  ⚠ Preload not found: ${p}`);
      }

      // Config setup function
      if (typeof featureConfig.setup === "function") {
        await featureConfig.setup({ testFilePath, testName, meta, globalThis });
      }

      // Run the test — indirect eval in sloppy mode for global scope
      (0, eval)(prepareForGlobalEval(testSource));

      await new Promise<void>((r) => setTimeout(r, 0));

      if (results.tests.length === 0 && results.status === null) {
        if (typeof (globalThis as any).done === "function")
          (globalThis as any).done();
      }
    }

    execute().catch((err: Error) => {
      clearTimeout(timer);
      settle({
        file: testName,
        error: err.message || String(err),
        results,
      });
    });
  });
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

const WPT_GLOBALS: string[] = [
  "test",
  "async_test",
  "promise_test",
  "promise_rejects_js",
  "promise_rejects_dom",
  "promise_rejects_quotaexceedederror",
  "promise_rejects_exactly",
  "generate_tests",
  "setup",
  "promise_setup",
  "done",
  "on_event",
  "step_timeout",
  "format_value",
  "assert_any",
  "assert_true",
  "assert_false",
  "assert_equals",
  "assert_not_equals",
  "assert_in_array",
  "assert_object_equals",
  "assert_array_equals",
  "assert_array_approx_equals",
  "assert_approx_equals",
  "assert_less_than",
  "assert_greater_than",
  "assert_between_exclusive",
  "assert_less_than_equal",
  "assert_greater_than_equal",
  "assert_between_inclusive",
  "assert_regexp_match",
  "assert_class_string",
  "assert_own_property",
  "assert_not_own_property",
  "assert_inherits",
  "assert_idl_attribute",
  "assert_readonly",
  "assert_throws_js",
  "assert_throws_dom",
  "assert_throws_quotaexceedederror",
  "assert_throws_exactly",
  "assert_unreached",
  "assert_implements",
  "assert_implements_optional",
  "fetch_tests_from_worker",
  "fetch_tests_from_window",
  "fetch_tests_from_shadow_realm",
  "begin_shadow_realm_tests",
  "timeout",
  "add_start_callback",
  "add_test_state_callback",
  "add_result_callback",
  "add_completion_callback",
  "AssertionError",
  "OptionalFeatureUnsupportedError",
  "EventWatcher",
  "subsetTestByKey",
];

function cleanupGlobals(featureConfig: FeatureConfig = {}): void {
  for (const name of WPT_GLOBALS) {
    try {
      delete (globalThis as any)[name];
    } catch (_e) {
      // ignore
    }
  }
  for (const name of featureConfig.globals || []) {
    try {
      delete (globalThis as any)[name];
    } catch (_e) {
      // ignore
    }
  }
  if (typeof featureConfig.cleanup === "function") {
    try {
      featureConfig.cleanup();
    } catch (_e) {
      // ignore
    }
  }
}

// ─── High-level run function ────────────────────────────────────────────────

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
export async function runWPT(
  feature: string,
  options: RunWPTOptions = {},
): Promise<RunWPTSummary> {
  const {
    wptRoot = process.cwd(),
    files: fileArgs = [],
    filter = "",
    timeout = 30000,
    debug = false,
    continueOnFail = true,
    preload = [],
    config: featureConfig = {},
    silent = false,
  } = options;

  const log = silent ? (() => {}) : console.log.bind(console);

  const featurePath = resolve(wptRoot, feature);
  if (!existsSync(featurePath)) {
    throw new Error(`Feature directory not found: ${featurePath}`);
  }

  // Discover test files
  let testFiles: string[];
  if (fileArgs.length > 0) {
    testFiles = [];
    for (const name of fileArgs) {
      const candidate = resolve(featurePath, name);
      if (existsSync(candidate)) {
        testFiles.push(candidate);
      } else {
        const allFiles = findTestFiles(featurePath);
        const match = allFiles.filter(
          (f) => f.endsWith(`/${name}`) || f.endsWith(name),
        );
        if (match.length > 0) testFiles.push(...match);
        else
          throw new Error(`Test file not found: ${name} (in ${featurePath})`);
      }
    }
  } else {
    testFiles = findTestFiles(featurePath);
  }

  if (filter) {
    const re = new RegExp(filter, "i");
    testFiles = testFiles.filter((f) => re.test(f));
  }

  if (testFiles.length === 0) {
    throw new Error(`No .any.js test files found in: ${feature}`);
  }

  log(`\n🔍 Found ${testFiles.length} .any.js test file(s) in "${feature}"\n`);

  // Run
  const fileResults: FileResult[] = [];
  let totalPass = 0,
    totalFail = 0,
    totalError = 0;
  let aborted = false;

  for (const testFile of testFiles) {
    const relPath = relative(wptRoot, testFile);
    const result = await runTestFile(testFile, {
      wptRoot,
      timeout: featureConfig.timeout || timeout,
      preload,
      featureConfig,
      debug,
    });

    const filePassCount = result.results.tests.filter(
      (t) => t.status === 0,
    ).length;
    const fileFailCount = result.results.tests.filter(
      (t) => t.status !== 0 && t.status !== 3,
    ).length;
    const total = result.results.tests.length;

    fileResults.push({
      file: relPath,
      passed: filePassCount,
      failed: fileFailCount,
      total,
      error: result.error,
      tests: result.results.tests,
    });

    if (result.error) {
      totalError++;
      log(`${BOLD}▶ ${relPath}${RESET}`);
      log(`  ${TEST_STATUSES[1].color}✗ ERROR: ${result.error}${RESET}\n`);
      if (!continueOnFail) {
        aborted = true;
        break;
      }
      continue;
    }

    totalPass += filePassCount;
    totalFail += fileFailCount;

    const filePassed = fileFailCount === 0 && total > 0;

    if (!debug) {
      if (filePassed) {
        log(
          `${TEST_STATUSES[0].color}  ✓ ${relPath}  ${DIM}(${filePassCount}/${total} passed)${RESET}`,
        );
      } else if (total === 0) {
        log(`${BOLD}▶ ${relPath}${RESET}  ${DIM}(no tests ran)${RESET}`);
      } else {
        log(
          `${BOLD}▶ ${relPath}${RESET}  ${TEST_STATUSES[1].color}${filePassCount}/${total} passed${RESET}`,
        );
        for (const t of result.results.tests.filter(
          (t) => t.status !== 0 && t.status !== 3,
        )) {
          const s = TEST_STATUSES[t.status] || {
            label: "UNKNOWN",
            color: "\x1b[90m",
          };
          log(`  ${s.color}✗ ${s.label}: ${t.name}${RESET}`);
          if (t.message) log(`    ${DIM}${t.message}${RESET}`);
        }
      }
    } else {
      log(`${BOLD}▶ ${relPath}${RESET}`);
      for (const t of result.results.tests) {
        const s = TEST_STATUSES[t.status] || {
          label: "UNKNOWN",
          color: "\x1b[90m",
        };
        if (t.status === 0) {
          log(`  ${s.color}✓ ${t.name}${RESET}`);
        } else {
          log(`  ${s.color}✗ ${s.label}: ${t.name}${RESET}`);
          if (t.message) log(`    ${DIM}${t.message}${RESET}`);
          if (t.stack)
            log(
              t.stack
                .split("\n")
                .map((l: string) => `      ${DIM}${l}${RESET}`)
                .join("\n"),
            );
        }
      }
      log(
        `  ${filePassed ? TEST_STATUSES[0].color : TEST_STATUSES[1].color}${filePassCount}/${total} passed${RESET}`,
      );
    }

    log("");

    if (!filePassed && !continueOnFail) {
      aborted = true;
      log(`${DIM}Aborted after first failure.${RESET}\n`);
      break;
    }
  }

  // Summary
  const summary: RunWPTSummary = {
    feature,
    passed: totalPass,
    failed: totalFail,
    errors: totalError,
    total: totalPass + totalFail,
    filesRan: fileResults.length,
    filesTotal: testFiles.length,
    aborted,
    files: fileResults,
  };

  log(`${BOLD}${"═".repeat(60)}${RESET}`);
  log(`${BOLD}WPT Results: ${feature}${RESET}`);
  log(`${"─".repeat(60)}`);
  log(
    `  Files:   ${fileResults.filter((f) => !f.error && f.failed === 0 && f.total > 0).length} passed, ${fileResults.filter((f) => f.error || f.failed > 0 || f.total === 0).length} failed (${fileResults.length}/${testFiles.length}${aborted ? ", aborted" : ""})`,
  );
  log(
    `  Tests:   ${TEST_STATUSES[0].color}${totalPass} passed${RESET}, ${TEST_STATUSES[1].color}${totalFail} failed${RESET}, ${totalError} errors`,
  );
  log(`${"═".repeat(60)}\n`);

  return summary;
}
