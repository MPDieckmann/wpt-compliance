// src/fetcher.ts — Download specific WPT test directories from GitHub
//
// Only fetches the files you need: test files (.any.js), their META: script=
// dependencies, resource files (JSON data, helper scripts), and
// resources/testharness.js.

import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
} from "fs";
import { join, dirname, relative } from "path";

export const WPT_REPO = "web-platform-tests/wpt";
export const WPT_BRANCH = "master";
export const RAW_BASE = `https://raw.githubusercontent.com/${WPT_REPO}/${WPT_BRANCH}`;
export const API_BASE = `https://api.github.com/repos/${WPT_REPO}`;

// ─── ANSI ───────────────────────────────────────────────────────────────────

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";

// ─── Types ──────────────────────────────────────────────────────────────────

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

interface GitHubEntry {
  path: string;
  type: string;
  size: number;
}

interface WPTManifest {
  feature: string;
  fetchedAt: string;
  branch: string;
  files: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function fetchJSON(url: string): Promise<any> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    if (res.status === 403) {
      throw new Error(
        `GitHub API rate limit exceeded. Set GITHUB_TOKEN env var to increase limits.\n` +
          `  export GITHUB_TOKEN=ghp_your_token_here`,
      );
    }
    throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function downloadFile(
  remotePath: string,
  localPath: string,
): Promise<string> {
  const url = `${RAW_BASE}/${remotePath}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${remotePath}: ${res.status}`);
  }
  const content = await res.text();
  const dir = dirname(localPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(localPath, content, "utf-8");
  return content;
}

// ─── List directory contents recursively via GitHub API ─────────────────────

async function listGitHubDir(
  remotePath: string,
  recursive = true,
): Promise<GitHubEntry[]> {
  const data = await fetchJSON(
    `${API_BASE}/contents/${remotePath}?ref=${WPT_BRANCH}`,
  );

  if (!Array.isArray(data)) {
    return [{ path: data.path, type: data.type, size: data.size }];
  }

  const results: GitHubEntry[] = [];
  for (const entry of data) {
    if (entry.type === "file") {
      results.push({ path: entry.path, type: "file", size: entry.size });
    } else if (entry.type === "dir" && recursive) {
      const sub = await listGitHubDir(entry.path, true);
      results.push(...sub);
    }
  }
  return results;
}

// ─── Parse META: script= from a test file to find dependencies ─────────────

function parseMetaScripts(source: string): string[] {
  const scripts: string[] = [];
  for (const line of source.split("\n")) {
    const match = line.match(/^\/\/\s*META:\s*script=(.+)$/);
    if (match) {
      scripts.push(match[1].trim());
    }
    if (
      line.trim() &&
      !line.startsWith("//") &&
      !line.startsWith("'use strict'")
    ) {
      break;
    }
  }
  return scripts;
}

function parseInlineFetches(source: string): string[] {
  const paths: string[] = [];
  const re = /fetch\(\s*["']([^"']+\.json)["']\s*\)/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    const p = match[1];
    if (!p.startsWith("http://") && !p.startsWith("https://")) {
      paths.push(p);
    }
  }
  return paths;
}

// ─── Main fetch logic ───────────────────────────────────────────────────────

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
export async function fetchFeature(
  feature: string,
  options: FetchFeatureOptions = {},
): Promise<FetchFeatureResult> {
  const {
    cacheDir = join(process.cwd(), ".wpt-cache"),
    force = false,
    verbose = false,
    include = null,
  } = options;

  const featureCacheDir = join(cacheDir, feature);
  const resourcesDir = join(cacheDir, "resources");
  const manifestPath = join(featureCacheDir, ".wpt-manifest.json");

  // Check if already downloaded (unless --force)
  if (!force && existsSync(manifestPath)) {
    const manifest: WPTManifest = JSON.parse(
      readFileSync(manifestPath, "utf-8"),
    );
    if (verbose) {
      console.log(
        `${DIM}Using cached WPT tests for "${feature}" (${manifest.files.length} files)${RESET}`,
      );
      console.log(`${DIM}  Use --force to re-download${RESET}`);
    }
    return { cacheDir, files: manifest.files.map((f) => join(cacheDir, f)) };
  }

  console.log(`${CYAN}📦 Downloading WPT tests for "${feature}"...${RESET}`);

  // 1. Ensure resources/testharness.js is present
  const testharnessLocal = join(resourcesDir, "testharness.js");
  if (!existsSync(testharnessLocal)) {
    process.stdout.write(`  ${DIM}resources/testharness.js ...${RESET}`);
    await downloadFile("resources/testharness.js", testharnessLocal);
    console.log(` ${GREEN}✓${RESET}`);
  }

  // 2. List all files in the feature directory
  process.stdout.write(`  ${DIM}Listing ${feature}/ ...${RESET}`);
  let allFiles: GitHubEntry[];
  try {
    allFiles = await listGitHubDir(feature);
  } catch (err: any) {
    console.log(` ✗`);
    throw new Error(
      `Could not list WPT directory "${feature}": ${err.message}`,
    );
  }
  console.log(` ${GREEN}${allFiles.length} files found${RESET}`);

  // 3. Filter to relevant files
  let filesToDownload = allFiles.filter((f) => {
    if (f.path.endsWith(".any.js")) return true;
    if (f.path.endsWith(".js")) return true;
    if (f.path.endsWith(".json")) return true;
    return false;
  });

  // Apply include filter if provided
  if (include && include.length > 0) {
    const includeRe = include.map((p) => new RegExp(p, "i"));
    filesToDownload = filesToDownload.filter((f) => {
      if (!f.path.endsWith(".any.js")) return true;
      return includeRe.some((re) => re.test(f.path));
    });
  }

  // 4. Download files
  const downloadedPaths: string[] = [];
  let downloaded = 0;
  const total = filesToDownload.length;
  const pendingDeps = new Set<string>();

  for (const file of filesToDownload) {
    const localPath = join(cacheDir, file.path);
    downloaded++;

    if (!force && existsSync(localPath)) {
      downloadedPaths.push(file.path);
      if (file.path.endsWith(".any.js")) {
        const content = readFileSync(localPath, "utf-8");
        for (const dep of parseMetaScripts(content)) {
          if (dep.startsWith("/")) pendingDeps.add(dep.slice(1));
        }
        for (const dep of parseInlineFetches(content)) {
          if (dep.startsWith("/")) pendingDeps.add(dep.slice(1));
          else pendingDeps.add(`${feature}/${dep}`);
        }
      }
      continue;
    }

    if (verbose) {
      process.stdout.write(
        `  ${DIM}[${downloaded}/${total}] ${file.path} ...${RESET}`,
      );
    } else {
      const pct = Math.round((downloaded / total) * 100);
      process.stdout.write(
        `\r  ${DIM}Downloading: ${downloaded}/${total} (${pct}%)${RESET}`,
      );
    }

    try {
      const content = await downloadFile(file.path, localPath);
      downloadedPaths.push(file.path);

      if (file.path.endsWith(".any.js")) {
        for (const dep of parseMetaScripts(content)) {
          if (dep.startsWith("/")) {
            pendingDeps.add(dep.slice(1));
          } else {
            pendingDeps.add(`${dirname(file.path)}/${dep}`);
          }
        }
        for (const dep of parseInlineFetches(content)) {
          if (dep.startsWith("/")) pendingDeps.add(dep.slice(1));
          else pendingDeps.add(`${dirname(file.path)}/${dep}`);
        }
      }

      if (verbose) console.log(` ${GREEN}✓${RESET}`);
    } catch (err: any) {
      if (verbose) console.log(` ${YELLOW}✗ ${err.message}${RESET}`);
    }
  }

  if (!verbose) console.log(""); // clear progress line

  // 5. Download external dependencies (META: script=/common/..., etc.)
  if (pendingDeps.size > 0) {
    console.log(
      `  ${DIM}Downloading ${pendingDeps.size} dependencies...${RESET}`,
    );
    for (const dep of pendingDeps) {
      const localPath = join(cacheDir, dep);
      if (existsSync(localPath) && !force) {
        downloadedPaths.push(dep);
        continue;
      }
      try {
        await downloadFile(dep, localPath);
        downloadedPaths.push(dep);
        if (verbose) console.log(`  ${DIM}  ✓ ${dep}${RESET}`);
      } catch (err: any) {
        if (verbose) console.log(`  ${DIM}  ✗ ${dep} (${err.message})${RESET}`);
      }
    }
  }

  // 6. Write manifest
  mkdirSync(dirname(manifestPath), { recursive: true });
  const manifest: WPTManifest = {
    feature,
    fetchedAt: new Date().toISOString(),
    branch: WPT_BRANCH,
    files: downloadedPaths,
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  const anyJsCount = downloadedPaths.filter((f) =>
    f.endsWith(".any.js"),
  ).length;
  console.log(
    `${GREEN}  ✓ Downloaded ${downloadedPaths.length} files (${anyJsCount} test files) into ${relative(process.cwd(), featureCacheDir)}${RESET}\n`,
  );

  return {
    cacheDir,
    files: downloadedPaths.map((f) => join(cacheDir, f)),
  };
}

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
export function listCachedFeatures(
  cacheDir: string = join(process.cwd(), ".wpt-cache"),
): CachedFeatureInfo[] {
  if (!existsSync(cacheDir)) return [];

  const results: CachedFeatureInfo[] = [];
  for (const entry of readdirSync(cacheDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "resources" || entry.name === "common") continue;
    const manifest = join(cacheDir, entry.name, ".wpt-manifest.json");
    if (existsSync(manifest)) {
      const data: WPTManifest = JSON.parse(readFileSync(manifest, "utf-8"));
      results.push({
        feature: entry.name,
        files: data.files.length,
        testFiles: data.files.filter((f) => f.endsWith(".any.js")).length,
        fetchedAt: data.fetchedAt,
      });
    }
  }
  return results;
}
