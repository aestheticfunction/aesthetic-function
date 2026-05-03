/**
 * @aesthetic-function/watcher - framework/index.ts
 *
 * Default FrameworkAnalyzer registrations.
 *
 * WHY: This module is the single place where analyzers are registered.
 * Call `initializeDefaultAnalyzers()` once at watcher startup. After that,
 * all file-extension dispatch goes through the registry.
 *
 * Adding a new framework (e.g., Svelte, Solid, Astro):
 *   1. Create `packages/watcher/src/framework/<name>/index.ts`
 *   2. Implement `FrameworkAnalyzer`
 *   3. `import { <name>Analyzer } from './<name>/index.js';`
 *   4. Call `registerFrameworkAnalyzer(<name>Analyzer);` below.
 *   No other files need to change.
 */

import { registerFrameworkAnalyzer } from './registry.js';
import { reactAnalyzer } from './reactAnalyzer.js';
import { vue3Analyzer } from './vue3/index.js';

// Re-export registry API so callers can import from one place.
export {
  registerFrameworkAnalyzer,
  resolveByPath,
  getRegisteredAnalyzers,
  clearRegistryForTesting,
} from './registry.js';

export type { FrameworkAnalyzer, AnalyzerOpts, LibraryHint } from './types.js';

// =============================================================================
// DEFAULT REGISTRATIONS
// =============================================================================

let initialized = false;

/**
 * Register all built-in framework analyzers.
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 * Call this once at watcher startup before any file processing.
 */
export function initializeDefaultAnalyzers(): void {
  if (initialized) return;
  initialized = true;

  // React / TypeScript / JavaScript — covers .tsx, .jsx, .ts, .js
  registerFrameworkAnalyzer(reactAnalyzer);

  // Vue 3 Single File Components — covers .vue
  registerFrameworkAnalyzer(vue3Analyzer);
}

/**
 * Reset initialized flag — FOR TESTING ONLY.
 * Use alongside clearRegistryForTesting().
 */
export function resetInitializedForTesting(): void {
  initialized = false;
}
