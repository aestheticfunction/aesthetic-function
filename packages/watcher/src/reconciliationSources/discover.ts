/**
 * @aesthetic-function/watcher - reconciliationSources/discover.ts
 *
 * Phase 14F: Multi-Source CI (Matrix) + Deterministic Source Discovery.
 *
 * WHY: Provides deterministic discovery of source files for multi-source
 * reconciliation in CI environments.
 *
 * SCOPE:
 * - Manifest file loading
 * - Glob pattern matching
 * - Deterministic sorting and de-duplication
 * - Existence filtering
 *
 * CONSTRAINTS:
 * - Deterministic output (same inputs → same list)
 * - Lexicographic sorting
 * - Canonical path normalization
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import type {
  SourceManifest,
  SourceDiscoveryOptions,
  SourceDiscoveryResult,
} from './types.js';
import {
  DEFAULT_MANIFEST_PATH,
  DEFAULT_SOURCE_GLOB,
  DEFAULT_IGNORE_PATTERNS,
} from './types.js';

// =============================================================================
// PATH UTILITIES
// =============================================================================

/**
 * Normalize a path to canonical form.
 * - Forward slashes
 * - No leading ./
 * - Repo-root relative
 */
export function normalizePath(filePath: string, repoRoot: string): string {
  // Resolve to absolute
  const absolute = resolve(repoRoot, filePath);

  // Make relative to repo root
  let normalized = relative(repoRoot, absolute);

  // Normalize separators (Windows)
  normalized = normalized.split(sep).join('/');

  // Strip leading ./
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  return normalized;
}

/**
 * Sort paths deterministically (lexicographic, case-sensitive).
 */
export function sortPaths(paths: string[]): string[] {
  return [...paths].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

/**
 * De-duplicate paths (preserving order of first occurrence).
 */
export function deduplicatePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  return paths.filter((p) => {
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });
}

// =============================================================================
// GLOB MATCHING (Simple Implementation)
// =============================================================================

/**
 * Simple glob pattern matcher.
 * Supports: *, **, ?
 */
function globToRegex(pattern: string): RegExp {
  // Escape special regex characters except * and ?
  let regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/<<<GLOBSTAR>>>/g, '.*');

  return new RegExp(`^${regex}$`);
}

/**
 * Check if a path matches a glob pattern.
 */
function matchesGlob(path: string, pattern: string): boolean {
  const regex = globToRegex(pattern);
  return regex.test(path);
}

/**
 * Check if a path matches any of the ignore patterns.
 */
function isIgnored(path: string, ignorePatterns: string[]): boolean {
  return ignorePatterns.some((pattern) => matchesGlob(path, pattern));
}

// =============================================================================
// FILE DISCOVERY
// =============================================================================

/**
 * Recursively find all files in a directory.
 */
function findFiles(dir: string, repoRoot: string, ignorePatterns: string[]): string[] {
  const results: string[] = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = normalizePath(fullPath, repoRoot);

      // Check ignore patterns early for directories
      if (isIgnored(relativePath, ignorePatterns)) {
        continue;
      }

      if (entry.isDirectory()) {
        results.push(...findFiles(fullPath, repoRoot, ignorePatterns));
      } else if (entry.isFile()) {
        results.push(relativePath);
      }
    }
  } catch {
    // Ignore permission errors, etc.
  }

  return results;
}

/**
 * Find files matching glob pattern(s).
 */
function findByGlob(
  repoRoot: string,
  patterns: string | string[],
  ignorePatterns: string[]
): string[] {
  const globPatterns = Array.isArray(patterns) ? patterns : [patterns];

  // Find all files
  const allFiles = findFiles(repoRoot, repoRoot, ignorePatterns);

  // Filter by glob patterns
  const matched = allFiles.filter((file) =>
    globPatterns.some((pattern) => matchesGlob(file, pattern))
  );

  return matched;
}

// =============================================================================
// MANIFEST LOADING
// =============================================================================

/**
 * Load source manifest from file.
 */
export function loadManifest(
  repoRoot: string,
  manifestPath: string = DEFAULT_MANIFEST_PATH
): SourceManifest | null {
  const fullPath = join(repoRoot, manifestPath);

  if (!existsSync(fullPath)) {
    return null;
  }

  try {
    const content = readFileSync(fullPath, 'utf-8');
    const manifest = JSON.parse(content) as SourceManifest;

    // Validate version
    if (manifest.version !== 1) {
      throw new Error(`Unsupported manifest version: ${manifest.version}`);
    }

    // Validate sources array
    if (!Array.isArray(manifest.sources)) {
      throw new Error('Manifest must have a sources array');
    }

    return manifest;
  } catch (error) {
    throw new Error(`Failed to load manifest: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// =============================================================================
// MAIN DISCOVERY FUNCTION
// =============================================================================

/**
 * Discover source files for reconciliation.
 *
 * Precedence:
 * 1. Explicit sources (if provided)
 * 2. CLI glob patterns (if provided)
 * 3. Manifest file (if exists)
 * 4. Default glob pattern
 *
 * @param options - Discovery options
 * @returns Discovery result with deterministic source list
 */
export function discoverSources(options: SourceDiscoveryOptions): SourceDiscoveryResult {
  const {
    repoRoot,
    glob,
    manifestPath = DEFAULT_MANIFEST_PATH,
    sources: explicitSources,
    ignore = DEFAULT_IGNORE_PATTERNS,
    filterExisting = true,
  } = options;

  let rawSources: string[] = [];
  let method: SourceDiscoveryResult['method'] = 'empty';
  const warnings: string[] = [];
  const filtered: string[] = [];

  // 1. Explicit sources
  if (explicitSources && explicitSources.length > 0) {
    rawSources = explicitSources;
    method = 'explicit';
  }
  // 2. Glob patterns
  else if (glob) {
    rawSources = findByGlob(repoRoot, glob, ignore);
    method = 'glob';
  }
  // 3. Manifest file
  else {
    const manifest = loadManifest(repoRoot, manifestPath);
    if (manifest && manifest.sources.length > 0) {
      rawSources = manifest.sources;
      method = 'manifest';

      // Apply manifest ignore patterns
      if (manifest.ignore) {
        rawSources = rawSources.filter((s) => !isIgnored(s, manifest.ignore!));
      }
    } else {
      // 4. Default glob (only if no manifest)
      rawSources = findByGlob(repoRoot, DEFAULT_SOURCE_GLOB, ignore);
      if (rawSources.length > 0) {
        method = 'glob';
      }
    }
  }

  // Normalize paths
  let sources = rawSources.map((s) => normalizePath(s, repoRoot));

  // Filter to existing files
  if (filterExisting) {
    sources = sources.filter((s) => {
      const fullPath = join(repoRoot, s);
      const exists = existsSync(fullPath) && statSync(fullPath).isFile();
      if (!exists) {
        filtered.push(s);
      }
      return exists;
    });

    if (filtered.length > 0) {
      warnings.push(`Filtered ${filtered.length} non-existent file(s)`);
    }
  }

  // De-duplicate and sort
  sources = sortPaths(deduplicatePaths(sources));

  return {
    sources,
    method,
    count: sources.length,
    filtered: filtered.length > 0 ? filtered : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Discover sources as a simple JSON output.
 * Convenience wrapper for CLI/scripts.
 */
export function discoverSourcesJson(options: SourceDiscoveryOptions): string {
  const result = discoverSources(options);
  return JSON.stringify(result.sources, null, 2);
}
