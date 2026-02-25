// src/runner.js — Core WPT test runner, importable as a module
//
// Can be used standalone or integrated into your own test pipeline:
//   import { runWPT } from "wpt-compliance/runner";
//   const results = await runWPT("url", { cacheDir: ".wpt-cache" });

import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, dirname, join, relative } from "path";

// ─── ANSI ───────────────────────────────────────────────────────────────────

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

const TEST_STATUSES = {
  0: { label: "PASS", color: "\x1b[32m" },
  1: { label: "FAIL", color: "\x1b[31m" },
  2: { label: "TIMEOUT", color: "\x1b[33m" },
  3: { label: "NOTRUN", color: "\x1b[90m" },
  4: { label: "PRECONDITION_FAILED", color: "\x1b[35m" },
};

// ─── META parser ────────────────────────────────────────────────────────────

export function parseMeta(source) {
  const meta = {
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

// ─── File discovery ─────────────────────────────────────────────────────────

export function findTestFiles(dir) {
  const results = [];
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
 * @param {string} testFilePath - Absolute path to the .any.js file
 * @param {object} options
 * @param {string} options.wptRoot      - Root of WPT files (for resolving /resources/...)
 * @param {number} options.timeout      - Base timeout in ms (default 30000)
 * @param {string[]} options.preload    - Preload script paths to import before each test
 * @param {object} options.featureConfig - Config from wpt.config.js for this feature
 * @param {boolean} options.debug       - Enable debug logging
 * @returns {Promise<{ file: string, error: string|null, results: object }>}
 */
export async function runTestFile(testFilePath, options = {}) {
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

  const results = {
    tests: [],
    status: null,
    asserts: [],
  };

  const timeoutMs = meta.timeout === "long" ? timeout * 6 : timeout;

  return new Promise((resolveRun) => {
    const timer = setTimeout(() => {
      resolveRun({
        file: testName,
        error: `Timeout after ${timeoutMs}ms`,
        results,
      });
    }, timeoutMs);

    async function execute() {
      const testharnessSource = readFileSync(testharnessPath, "utf-8");

      if (typeof globalThis.self === "undefined") {
        globalThis.self = globalThis;
      }

      cleanupGlobals(featureConfig);

      // GLOBAL shim
      globalThis.GLOBAL = {
        isWindow: () => false,
        isShadowRealm: () => false,
        isWorker: () => false,
        isDedicatedWorker: () => false,
        isSharedWorker: () => false,
        isServiceWorker: () => false,
      };

      if (typeof globalThis.subsetTestByKey === "undefined") {
        globalThis.subsetTestByKey = function (key, testFunc, ...args) {
          return testFunc(...args);
        };
      }

      // testharness.js
      const testharnessFunc = new Function(testharnessSource);
      testharnessFunc.call(globalThis);

      // completion callback
      globalThis.add_completion_callback((tests, harnessStatus, asserts) => {
        clearTimeout(timer);
        results.tests = tests.map((t) => ({
          name: t.name,
          status: t.status,
          message: t.message,
          stack: t.stack,
        }));
        results.status = harnessStatus;
        results.asserts = asserts;
        resolveRun({ file: testName, results, error: null });
      });

      // mock location
      if (typeof globalThis.location === "undefined") {
        globalThis.location = {
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

      globalThis.get_title = globalThis.get_title || (() => testName);

      // META: script= dependencies
      for (const scriptPath of meta.scripts) {
        let resolvedPath;
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
        const scriptFunc = new Function(scriptSource);
        scriptFunc.call(globalThis);
      }

      // Patch fetch for local files
      const originalFetch = globalThis.fetch;
      globalThis.fetch = function patchedFetch(input, init) {
        if (
          typeof input === "string" &&
          !input.startsWith("http://") &&
          !input.startsWith("https://") &&
          !input.startsWith("blob:") &&
          !input.startsWith("data:")
        ) {
          let filePath;
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
        return originalFetch.call(globalThis, input, init);
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

      // Run the test
      const testFunc = new Function(testSource);
      testFunc.call(globalThis);

      await new Promise((r) => setTimeout(r, 0));

      if (results.tests.length === 0 && results.status === null) {
        if (typeof globalThis.done === "function") globalThis.done();
      }
    }

    execute().catch((err) => {
      clearTimeout(timer);
      resolveRun({
        file: testName,
        error: err.message || String(err),
        results,
      });
    });
  });
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

const WPT_GLOBALS = [
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

function cleanupGlobals(featureConfig = {}) {
  for (const name of WPT_GLOBALS) {
    try {
      delete globalThis[name];
    } catch (e) {}
  }
  for (const name of featureConfig.globals || []) {
    try {
      delete globalThis[name];
    } catch (e) {}
  }
  if (typeof featureConfig.cleanup === "function") {
    try {
      featureConfig.cleanup();
    } catch (e) {}
  }
}

// ─── High-level run function ────────────────────────────────────────────────

/**
 * Run all WPT tests for a feature. This is the main programmatic API.
 *
 * @param {string} feature        - Feature name (e.g. "url", "IndexedDB")
 * @param {object} options
 * @param {string} options.wptRoot       - Root directory containing WPT files
 * @param {string[]} options.files       - Specific test file names to run
 * @param {string} options.filter        - Regex filter for file names
 * @param {number} options.timeout       - Timeout in ms
 * @param {boolean} options.debug        - Verbose output
 * @param {boolean} options.continueOnFail - Continue after failure
 * @param {string[]} options.preload     - Preload scripts
 * @param {object} options.config        - Feature config (same as wpt.config.js entry)
 * @param {boolean} options.silent       - Suppress all console output
 * @returns {Promise<{ passed: number, failed: number, total: number, files: object[] }>}
 */
export async function runWPT(feature, options = {}) {
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

  const log = silent ? () => {} : console.log.bind(console);

  const featurePath = resolve(wptRoot, feature);
  if (!existsSync(featurePath)) {
    throw new Error(`Feature directory not found: ${featurePath}`);
  }

  // Discover test files
  let testFiles;
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
  const fileResults = [];
  let totalPass = 0,
    totalFail = 0,
    totalError = 0;
  let aborted = false;

  for (const testFile of testFiles) {
    const relPath = relative(wptRoot, testFile);
    const result = await runTestFile(testFile, {
      wptRoot,
      timeout,
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
                .map((l) => `      ${DIM}${l}${RESET}`)
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
  const summary = {
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
