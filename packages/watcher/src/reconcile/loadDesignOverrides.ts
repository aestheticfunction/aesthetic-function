/**
 * @aesthetic-function/watcher - reconcile/loadDesignOverrides.ts
 *
 * Safely loads design-overrides.json with in-memory caching.
 *
 * WHY: Avoids reading disk on every file change.
 * The cache has a short TTL (2 seconds) to balance freshness
 * with performance. If the file is missing or invalid, returns null.
 */

import { readFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DesignOverrides } from './types.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Cache TTL in milliseconds.
 * WHY: Short TTL (2s) means we re-read quickly after Figma changes
 * but don't hit disk on every file save during rapid iteration.
 */
const CACHE_TTL_MS = 2000;

/**
 * Path to design-overrides.json at repo root.
 * Computed relative to this file's location.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_OVERRIDES_PATH = join(__dirname, '..', '..', '..', '..', 'design-overrides.json');

// =============================================================================
// CACHE STATE
// =============================================================================

interface CacheEntry {
  data: DesignOverrides;
  timestamp: number;
}

let cache: CacheEntry | null = null;
let overridesPath = DEFAULT_OVERRIDES_PATH;

/**
 * Set a custom path for design-overrides.json.
 * Useful for testing.
 */
export function setOverridesPath(path: string): void {
  overridesPath = path;
  cache = null; // Invalidate cache when path changes
}

/**
 * Reset to default overrides path.
 */
export function resetOverridesPath(): void {
  overridesPath = DEFAULT_OVERRIDES_PATH;
  cache = null;
}

/**
 * Clear the cache.
 * Useful for testing.
 */
export function clearOverridesCache(): void {
  cache = null;
}

// =============================================================================
// LOADER
// =============================================================================

/**
 * Load design overrides from disk with caching.
 *
 * Returns null if:
 * - File doesn't exist
 * - File contains invalid JSON
 * - Any other read error occurs
 *
 * Logs a warning on error but never throws.
 *
 * @returns DesignOverrides or null
 */
export async function loadDesignOverrides(): Promise<DesignOverrides | null> {
  const now = Date.now();

  // Return cached value if still fresh
  if (cache && (now - cache.timestamp) < CACHE_TTL_MS) {
    return cache.data;
  }

  try {
    // Check if file exists
    await access(overridesPath);

    // Read and parse
    const content = await readFile(overridesPath, 'utf-8');
    const data = JSON.parse(content) as DesignOverrides;

    // Update cache
    cache = { data, timestamp: now };

    return data;
  } catch (error) {
    // File doesn't exist - this is normal, not an error
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      // No overrides file yet - return null silently
      cache = null;
      return null;
    }

    // JSON parse error or other issue
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn(`[Watcher] ⚠ Could not load design-overrides.json: ${errorMsg}`);
    cache = null;
    return null;
  }
}

/**
 * Get the current overrides path.
 * Useful for debugging and testing.
 */
export function getOverridesPath(): string {
  return overridesPath;
}
