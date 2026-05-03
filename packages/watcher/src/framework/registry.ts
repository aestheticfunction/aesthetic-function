/**
 * @aesthetic-function/watcher - framework/registry.ts
 *
 * FrameworkAnalyzer registry.
 *
 * WHY: A single source-of-truth for extension → analyzer dispatch.
 * Calling code (watch.ts, cliReconcile.ts) resolves an analyzer from a
 * file path and calls the same three-method interface regardless of framework.
 *
 * Design constraints:
 * - The registry is populated at startup (packages/watcher/src/framework/index.ts).
 * - Registration order does not matter; extension uniqueness is enforced.
 * - If two analyzers claim the same extension, the later registration wins
 *   (allows test overrides without special APIs).
 * - resolveByPath() returns undefined for unsupported extensions; callers
 *   log 'unsupported-extension' and skip — never throw.
 */

import type { FrameworkAnalyzer } from './types.js';

// =============================================================================
// INTERNAL STATE
// =============================================================================

/** Extension → analyzer map. Extensions include the leading dot (e.g. '.vue'). */
const REGISTRY = new Map<string, FrameworkAnalyzer>();

// =============================================================================
// REGISTRATION
// =============================================================================

/**
 * Register a FrameworkAnalyzer.
 *
 * Each extension in `analyzer.extensions` is mapped to this analyzer.
 * If another analyzer already claimed that extension, the new one wins.
 *
 * @param analyzer - The analyzer to register
 */
export function registerFrameworkAnalyzer(analyzer: FrameworkAnalyzer): void {
  for (const ext of analyzer.extensions) {
    const normalized = ext.toLowerCase().startsWith('.')
      ? ext.toLowerCase()
      : `.${ext.toLowerCase()}`;
    REGISTRY.set(normalized, analyzer);
  }
}

// =============================================================================
// RESOLUTION
// =============================================================================

/**
 * Resolve a FrameworkAnalyzer from a file path.
 *
 * @param filePath - Absolute or relative path to the source file
 * @returns The registered analyzer, or undefined if the extension is not supported
 */
export function resolveByPath(filePath: string): FrameworkAnalyzer | undefined {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1) {
    return undefined;
  }
  const ext = filePath.slice(lastDot).toLowerCase();
  return REGISTRY.get(ext);
}

/**
 * Return all registered analyzers (read-only snapshot).
 *
 * Useful for diagnostics and tests.
 */
export function getRegisteredAnalyzers(): ReadonlyArray<FrameworkAnalyzer> {
  // De-duplicate by id (each analyzer may cover multiple extensions)
  const seen = new Map<string, FrameworkAnalyzer>();
  for (const analyzer of REGISTRY.values()) {
    seen.set(analyzer.id, analyzer);
  }
  return Array.from(seen.values());
}

/**
 * Clear all registrations.
 *
 * FOR TESTING ONLY. Do not call in production code.
 */
export function clearRegistryForTesting(): void {
  REGISTRY.clear();
}
